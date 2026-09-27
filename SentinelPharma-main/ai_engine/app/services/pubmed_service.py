"""NCBI E-utilities PubMed adapter. Never fabricates missing metadata."""
from datetime import datetime, timezone
from typing import Any, Dict, List
import xml.etree.ElementTree as ET

import httpx

from app.core.config import settings


class PubMedUnavailable(Exception):
    pass


class PubMedService:
    base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

    def __init__(self, client: httpx.AsyncClient | None = None):
        self.client = client

    def _params(self) -> Dict[str, str]:
        if not settings.NCBI_EMAIL:
            raise PubMedUnavailable("NCBI_EMAIL is not configured")
        params = {"tool": settings.NCBI_TOOL_NAME, "email": settings.NCBI_EMAIL}
        if settings.NCBI_API_KEY:
            params["api_key"] = settings.NCBI_API_KEY
        return params

    async def search(self, query: str, limit: int = 10) -> Dict[str, Any]:
        query = " ".join(query.split())
        if not query:
            raise ValueError("query is required")
        limit = max(1, min(limit, settings.PUBMED_MAX_RESULTS))
        owns_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=settings.PUBMED_TIMEOUT_SECONDS)
        try:
            search_params = {**self._params(), "db": "pubmed", "term": query, "retmax": str(limit), "retmode": "json"}
            response = await client.get(f"{self.base_url}/esearch.fcgi", params=search_params)
            response.raise_for_status()
            ids = response.json().get("esearchresult", {}).get("idlist")
            if not isinstance(ids, list):
                raise PubMedUnavailable("Malformed ESearch response")
            records = await self._fetch_records(client, ids)
            retrieved_at = datetime.now(timezone.utc).isoformat()
            return {"query": query, "retrievedAt": retrieved_at, "evidence": [self._normalize(record, retrieved_at) for record in records]}
        except (httpx.HTTPError, ValueError, ET.ParseError, PubMedUnavailable) as exc:
            if isinstance(exc, ValueError) and str(exc) == "query is required":
                raise
            raise PubMedUnavailable(str(exc)) from exc
        finally:
            if owns_client:
                await client.aclose()

    async def _fetch_records(self, client: httpx.AsyncClient, ids: List[str]) -> List[ET.Element]:
        if not ids:
            return []
        params = {**self._params(), "db": "pubmed", "id": ",".join(ids), "retmode": "xml"}
        response = await client.get(f"{self.base_url}/efetch.fcgi", params=params)
        response.raise_for_status()
        root = ET.fromstring(response.text)
        return root.findall(".//PubmedArticle")

    def _text(self, node: ET.Element, path: str) -> str | None:
        found = node.find(path)
        return "".join(found.itertext()).strip() if found is not None else None

    def _normalize(self, record: ET.Element, retrieved_at: str) -> Dict[str, Any]:
        pmid = self._text(record, ".//PMID")
        if not pmid:
            raise PubMedUnavailable("PubMed record missing PMID")
        article = record.find(".//Article")
        if article is None:
            raise PubMedUnavailable("PubMed record missing article metadata")
        authors = []
        for author in article.findall(".//Author"):
            name = " ".join(filter(None, [self._text(author, "ForeName"), self._text(author, "LastName")]))
            if name:
                authors.append(name)
        doi = next(("".join(node.itertext()).strip() for node in record.findall(".//ArticleId") if node.attrib.get("IdType") == "doi"), None)
        abstract = " ".join("".join(node.itertext()).strip() for node in article.findall(".//Abstract/AbstractText")) or None
        published = self._text(article, ".//JournalIssue/PubDate/Year") or self._text(article, ".//ArticleDate/Year")
        return {
            "id": f"PMID:{pmid}", "claim": self._text(article, "ArticleTitle"), "sourceType": "PUBMED", "sourceName": "PubMed",
            "sourceId": pmid, "sourceUrl": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/", "retrievedAt": retrieved_at,
            "publishedAt": published, "evidenceType": "BIOMEDICAL_LITERATURE", "dataMode": "SOURCE_BACKED",
            "verificationStatus": "VERIFIED_SOURCE", "metadata": {"authors": authors, "journal": self._text(article, ".//Journal/Title"), "doi": doi, "abstract": abstract,
              "publicationTypes": [self._text(n, ".") for n in record.findall(".//PublicationType") if self._text(n, ".")]}
        }
