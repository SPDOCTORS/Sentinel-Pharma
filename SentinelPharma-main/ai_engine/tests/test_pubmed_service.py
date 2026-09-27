import httpx
import pytest

from app.core.config import settings
from app.services.pubmed_service import PubMedService, PubMedUnavailable


ARTICLE_XML = '''<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>12345678</PMID><Article><ArticleTitle>Metformin in pancreatic cancer</ArticleTitle><Abstract><AbstractText>Reported abstract.</AbstractText></Abstract><Journal><ISSN>1</ISSN><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue><Title>Example Journal</Title></Journal><AuthorList><Author><ForeName>Ada</ForeName><LastName>Lovelace</LastName></Author></AuthorList></Article><PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1000/example</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>'''


class FakeResponse:
    def __init__(self, payload=None, text=''):
        self.payload, self.text = payload, text

    def json(self):
        return self.payload

    def raise_for_status(self):
        return None


class FakeClient:
    def __init__(self, responses):
        self.responses = iter(responses)

    async def get(self, *_args, **_kwargs):
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.mark.asyncio
async def test_pubmed_metadata_is_source_backed_without_fabrication(monkeypatch):
    monkeypatch.setattr(settings, 'NCBI_EMAIL', 'test@example.com')
    service = PubMedService(FakeClient([
        FakeResponse({'esearchresult': {'idlist': ['12345678']}}),
        FakeResponse(text=ARTICLE_XML),
    ]))

    result = await service.search(' metformin   pancreatic cancer ')

    assert result['query'] == 'metformin pancreatic cancer'
    item = result['evidence'][0]
    assert item['sourceId'] == '12345678'
    assert item['dataMode'] == 'SOURCE_BACKED'
    assert item['verificationStatus'] == 'VERIFIED_SOURCE'
    assert item['metadata']['doi'] == '10.1000/example'
    assert item['metadata']['abstract'] == 'Reported abstract.'


@pytest.mark.asyncio
async def test_zero_results_is_successful_empty_evidence(monkeypatch):
    monkeypatch.setattr(settings, 'NCBI_EMAIL', 'test@example.com')
    result = await PubMedService(FakeClient([FakeResponse({'esearchresult': {'idlist': []}})])).search('no result')
    assert result['evidence'] == []


@pytest.mark.asyncio
async def test_timeout_and_malformed_response_fail_without_fallback(monkeypatch):
    monkeypatch.setattr(settings, 'NCBI_EMAIL', 'test@example.com')
    for response in [httpx.TimeoutException('timeout'), FakeResponse({'unexpected': []})]:
        with pytest.raises(PubMedUnavailable):
            await PubMedService(FakeClient([response])).search('metformin')
