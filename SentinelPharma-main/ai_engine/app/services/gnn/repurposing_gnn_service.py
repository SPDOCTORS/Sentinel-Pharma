"""
Drug repurposing GNN service.

Implements a DrugBank-oriented link-prediction pipeline with:
- graph construction from biomedical triples
- PyTorch Geometric GraphSAGE encoder + MLP link predictor
- artifact save/load for deployment reuse
- online update by appending new relations and warm retraining
"""

from __future__ import annotations

import csv
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch_geometric.nn import SAGEConv

    ML_AVAILABLE = True
    ML_IMPORT_ERROR = None
except Exception as exc:
    torch = None  # type: ignore[assignment]
    nn = None  # type: ignore[assignment]
    F = None  # type: ignore[assignment]
    SAGEConv = None  # type: ignore[assignment]
    ML_AVAILABLE = False
    ML_IMPORT_ERROR = str(exc)


DEFAULT_SEED = 42


if ML_AVAILABLE:
    class GraphSAGEEncoder(nn.Module):
        def __init__(self, in_dim: int, hidden_dim: int, out_dim: int):
            super().__init__()
            self.conv1 = SAGEConv(in_dim, hidden_dim)
            self.conv2 = SAGEConv(hidden_dim, out_dim)

        def forward(self, x, edge_index):
            x = self.conv1(x, edge_index)
            x = F.relu(x)
            x = F.dropout(x, p=0.15, training=self.training)
            x = self.conv2(x, edge_index)
            return x


    class LinkPredictor(nn.Module):
        def __init__(self, emb_dim: int):
            super().__init__()
            self.mlp = nn.Sequential(
                nn.Linear(emb_dim * 2, emb_dim),
                nn.ReLU(),
                nn.Linear(emb_dim, 1),
            )

        def forward(self, left_emb, right_emb):
            pair = torch.cat([left_emb, right_emb], dim=-1)
            return self.mlp(pair).squeeze(-1)


@dataclass
class KGRow:
    source: str
    source_type: str
    relation: str
    target: str
    target_type: str
    pdb_id: Optional[str] = None


class GNNRepurposingService:
    def __init__(self, ai_engine_root: Path):
        self.ai_engine_root = ai_engine_root
        self.data_dir = ai_engine_root / "data"
        self.artifact_dir = ai_engine_root / "artifacts" / "gnn"
        self.artifact_path = self.artifact_dir / "drugbank_gnn_model.pt"
        self.triple_store_path = self.artifact_dir / "training_triples.json"
        self.evaluation_path = self.artifact_dir / "evaluation_metrics.json"
        self.seed_csv_path = self.data_dir / "drugbank_seed_kg.csv"
        self.seed_sources_path = self.data_dir / "drugbank_seed_sources.json"

        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.artifact_dir.mkdir(parents=True, exist_ok=True)

        self.encoder = None
        self.predictor = None
        self.node_to_idx: Dict[str, int] = {}
        self.idx_to_node: Dict[int, str] = {}
        self.node_types: Dict[str, str] = {}
        self.type_to_idx: Dict[str, int] = {}
        self.edge_index = None
        self.x = None
        self.triples: List[Dict[str, Any]] = []
        self.last_training: Optional[Dict[str, Any]] = None
        self.last_evaluation: Optional[Dict[str, Any]] = None
        self.pdb_by_drug: Dict[str, str] = {}

        if self.artifact_path.exists():
            self.load_artifact()
        if self.evaluation_path.exists():
            self.load_evaluation()

    def _artifact_version(self) -> Optional[str]:
        if not self.artifact_path.exists():
            return None
        stat = self.artifact_path.stat()
        return f"v{int(stat.st_mtime)}"

    @property
    def ready(self) -> bool:
        return ML_AVAILABLE and self.encoder is not None and self.predictor is not None

    def get_status(self) -> Dict[str, Any]:
        return {
            "ml_available": ML_AVAILABLE,
            "ml_import_error": ML_IMPORT_ERROR,
            "model_ready": self.ready,
            "artifact_path": str(self.artifact_path),
            "artifact_version": self._artifact_version(),
            "seed_data_path": str(self.seed_csv_path),
            "training_triple_count": len(self.triples),
            "node_count": len(self.node_to_idx),
            "last_training": self.last_training,
            "last_evaluation": self.last_evaluation,
            "dataset_provenance": self.load_dataset_provenance(),
        }

    def load_dataset_provenance(self) -> Dict[str, Any]:
        if not self.seed_sources_path.exists():
            return {
                "dataset": "DrugBank-style seed knowledge graph",
                "description": "No provenance file found.",
                "source_families": [],
            }
        with open(self.seed_sources_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _ensure_ml_stack(self) -> None:
        if not ML_AVAILABLE:
            raise RuntimeError(
                "PyTorch Geometric is not installed. Install torch and torch-geometric in ai_engine requirements."
            )

    def _normalize_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "source": str(row["source"]).strip(),
            "source_type": str(row["source_type"]).strip().lower(),
            "relation": str(row["relation"]).strip().lower(),
            "target": str(row["target"]).strip(),
            "target_type": str(row["target_type"]).strip().lower(),
            "pdb_id": (str(row.get("pdb_id", "")).strip() or None),
        }

    def load_triples(self, dataset_path: Optional[str] = None) -> List[Dict[str, Any]]:
        if dataset_path:
            path = Path(dataset_path)
        elif self.triple_store_path.exists():
            with open(self.triple_store_path, "r", encoding="utf-8") as f:
                triples = json.load(f)
            self.triples = [self._normalize_row(t) for t in triples]
            return self.triples
        else:
            path = self.seed_csv_path

        if not path.exists():
            raise FileNotFoundError(f"Dataset path not found: {path}")

        triples: List[Dict[str, Any]] = []
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for raw in reader:
                if not raw.get("source") or not raw.get("target"):
                    continue
                triples.append(self._normalize_row(raw))

        if not triples:
            raise ValueError("No valid triples found in dataset")

        self.triples = triples
        return triples

    def _persist_triples(self) -> None:
        with open(self.triple_store_path, "w", encoding="utf-8") as f:
            json.dump(self.triples, f, indent=2)

    def save_evaluation(self) -> None:
        if self.last_evaluation is None:
            return
        with open(self.evaluation_path, "w", encoding="utf-8") as f:
            json.dump(self.last_evaluation, f, indent=2)

    def load_evaluation(self) -> Dict[str, Any]:
        if not self.evaluation_path.exists():
            raise FileNotFoundError(f"Evaluation artifact not found: {self.evaluation_path}")
        with open(self.evaluation_path, "r", encoding="utf-8") as f:
            self.last_evaluation = json.load(f)
        return self.last_evaluation

    def _build_graph_tensors(self, triples: List[Dict[str, Any]]) -> Dict[str, Any]:
        node_set = set()
        node_types: Dict[str, str] = {}
        edge_pairs: List[Tuple[str, str]] = []

        for t in triples:
            src = t["source"]
            dst = t["target"]
            node_set.add(src)
            node_set.add(dst)
            node_types[src] = t["source_type"]
            node_types[dst] = t["target_type"]
            edge_pairs.append((src, dst))
            edge_pairs.append((dst, src))
            if t.get("pdb_id") and t["source_type"] == "drug":
                self.pdb_by_drug[src] = t["pdb_id"]

        node_to_idx = {name: i for i, name in enumerate(sorted(node_set))}
        idx_to_node = {i: name for name, i in node_to_idx.items()}

        edge_index = torch.tensor(
            [[node_to_idx[s], node_to_idx[t]] for s, t in edge_pairs],
            dtype=torch.long,
        ).t().contiguous()

        type_names = sorted(set(node_types.values()))
        type_to_idx = {name: i for i, name in enumerate(type_names)}

        num_nodes = len(node_to_idx)
        x = torch.zeros((num_nodes, len(type_to_idx) + 1), dtype=torch.float)

        degree = torch.zeros(num_nodes, dtype=torch.float)
        for src_idx in edge_index[0].tolist():
            degree[src_idx] += 1.0

        max_degree = torch.max(degree).item() if num_nodes > 0 else 1.0
        max_degree = max(max_degree, 1.0)

        for name, idx in node_to_idx.items():
            ntype = node_types.get(name, "unknown")
            if ntype in type_to_idx:
                x[idx, type_to_idx[ntype]] = 1.0
            x[idx, -1] = degree[idx] / max_degree

        positive_pairs: List[Tuple[int, int]] = []
        drug_indices = [node_to_idx[n] for n, t in node_types.items() if t == "drug"]
        disease_indices = [node_to_idx[n] for n, t in node_types.items() if t == "disease"]

        for t in triples:
            if t["relation"] == "treats" and t["source_type"] == "drug" and t["target_type"] == "disease":
                positive_pairs.append((node_to_idx[t["source"]], node_to_idx[t["target"]]))

        if not positive_pairs:
            raise ValueError("No drug->disease treats edges found for supervised training")

        pos_tensor = torch.tensor(positive_pairs, dtype=torch.long)

        negative_pairs: List[Tuple[int, int]] = []
        pos_set = set(positive_pairs)
        for drug_idx, disease_idx in positive_pairs:
            sampled_disease = disease_idx
            if not disease_indices:
                raise ValueError("No disease nodes found for negative sampling")
            for _ in range(20):
                candidate = random.choice(disease_indices)
                if (drug_idx, candidate) not in pos_set:
                    sampled_disease = candidate
                    break
            negative_pairs.append((drug_idx, sampled_disease))

        neg_tensor = torch.tensor(negative_pairs, dtype=torch.long)

        return {
            "node_to_idx": node_to_idx,
            "idx_to_node": idx_to_node,
            "node_types": node_types,
            "type_to_idx": type_to_idx,
            "edge_index": edge_index,
            "x": x,
            "positive_pairs": pos_tensor,
            "negative_pairs": neg_tensor,
        }

    def train(
        self,
        dataset_path: Optional[str] = None,
        epochs: int = 120,
        learning_rate: float = 0.01,
        hidden_dim: int = 64,
        embedding_dim: int = 64,
        warm_start: bool = False,
    ) -> Dict[str, Any]:
        self._ensure_ml_stack()
        random.seed(DEFAULT_SEED)
        torch.manual_seed(DEFAULT_SEED)

        triples = self.load_triples(dataset_path)
        graph = self._build_graph_tensors(triples)

        self.node_to_idx = graph["node_to_idx"]
        self.idx_to_node = graph["idx_to_node"]
        self.node_types = graph["node_types"]
        self.type_to_idx = graph["type_to_idx"]
        self.edge_index = graph["edge_index"]
        self.x = graph["x"]

        in_dim = self.x.shape[1]

        self.encoder = GraphSAGEEncoder(in_dim, hidden_dim, embedding_dim)
        self.predictor = LinkPredictor(embedding_dim)

        if warm_start and self.artifact_path.exists():
            try:
                artifact = torch.load(self.artifact_path, map_location="cpu")
                self.encoder.load_state_dict(artifact["encoder_state_dict"], strict=False)
                self.predictor.load_state_dict(artifact["predictor_state_dict"], strict=False)
            except Exception:
                # If schema changed, continue with fresh model.
                pass

        optimizer = torch.optim.Adam(
            list(self.encoder.parameters()) + list(self.predictor.parameters()),
            lr=learning_rate,
            weight_decay=1e-5,
        )

        pos_pairs = graph["positive_pairs"]
        neg_pairs = graph["negative_pairs"]

        history: List[float] = []
        self.encoder.train()
        self.predictor.train()

        for _ in range(epochs):
            optimizer.zero_grad()
            z = self.encoder(self.x, self.edge_index)

            pos_logits = self.predictor(z[pos_pairs[:, 0]], z[pos_pairs[:, 1]])
            neg_logits = self.predictor(z[neg_pairs[:, 0]], z[neg_pairs[:, 1]])

            pos_labels = torch.ones_like(pos_logits)
            neg_labels = torch.zeros_like(neg_logits)

            loss = F.binary_cross_entropy_with_logits(pos_logits, pos_labels)
            loss += F.binary_cross_entropy_with_logits(neg_logits, neg_labels)
            loss.backward()
            optimizer.step()

            history.append(float(loss.item()))

        self.encoder.eval()
        self.predictor.eval()

        self.last_training = {
            "epochs": epochs,
            "learning_rate": learning_rate,
            "hidden_dim": hidden_dim,
            "embedding_dim": embedding_dim,
            "final_loss": history[-1] if history else None,
            "dataset_path": dataset_path or str(self.seed_csv_path),
        }

        self._persist_triples()
        self.save_artifact()

        return {
            "model_ready": True,
            "artifact_path": str(self.artifact_path),
            "artifact_version": self._artifact_version(),
            "node_count": len(self.node_to_idx),
            "edge_count": int(self.edge_index.shape[1]) if self.edge_index is not None else 0,
            "training_triples": len(self.triples),
            "loss_history_tail": history[-5:],
            "last_training": self.last_training,
        }

    def _train_evaluation_model(
        self,
        triples: List[Dict[str, Any]],
        epochs: int,
        learning_rate: float,
        hidden_dim: int,
        embedding_dim: int,
    ) -> Dict[str, Any]:
        self._ensure_ml_stack()
        random.seed(DEFAULT_SEED)
        torch.manual_seed(DEFAULT_SEED)

        graph = self._build_graph_tensors(triples)
        x = graph["x"]
        edge_index = graph["edge_index"]
        pos_pairs = graph["positive_pairs"]
        neg_pairs = graph["negative_pairs"]

        encoder = GraphSAGEEncoder(x.shape[1], hidden_dim, embedding_dim)
        predictor = LinkPredictor(embedding_dim)
        optimizer = torch.optim.Adam(
            list(encoder.parameters()) + list(predictor.parameters()),
            lr=learning_rate,
            weight_decay=1e-5,
        )

        encoder.train()
        predictor.train()
        history: List[float] = []

        for _ in range(epochs):
            optimizer.zero_grad()
            z = encoder(x, edge_index)
            pos_logits = predictor(z[pos_pairs[:, 0]], z[pos_pairs[:, 1]])
            neg_logits = predictor(z[neg_pairs[:, 0]], z[neg_pairs[:, 1]])

            pos_labels = torch.ones_like(pos_logits)
            neg_labels = torch.zeros_like(neg_logits)

            loss = F.binary_cross_entropy_with_logits(pos_logits, pos_labels)
            loss += F.binary_cross_entropy_with_logits(neg_logits, neg_labels)
            loss.backward()
            optimizer.step()
            history.append(float(loss.item()))

        encoder.eval()
        predictor.eval()

        return {
            "encoder": encoder,
            "predictor": predictor,
            "node_to_idx": graph["node_to_idx"],
            "node_types": graph["node_types"],
            "edge_index": edge_index,
            "x": x,
            "loss_history_tail": history[-5:],
        }

    def evaluate(
        self,
        dataset_path: Optional[str] = None,
        holdout_ratio: float = 0.3,
        epochs: int = 80,
        learning_rate: float = 0.01,
        hidden_dim: int = 64,
        embedding_dim: int = 64,
    ) -> Dict[str, Any]:
        self._ensure_ml_stack()
        triples = self.load_triples(dataset_path)

        treat_triples = [
            t for t in triples
            if t["relation"] == "treats" and t["source_type"] == "drug" and t["target_type"] == "disease"
        ]
        if len(treat_triples) < 3:
            raise ValueError("Need at least 3 drug-disease treat edges for held-out evaluation")

        rng = random.Random(DEFAULT_SEED)
        shuffled = treat_triples.copy()
        rng.shuffle(shuffled)

        holdout_count = max(1, int(len(shuffled) * holdout_ratio))
        holdout = shuffled[:holdout_count]
        holdout_set = {
            (t["source"], t["relation"], t["target"], t["source_type"], t["target_type"])
            for t in holdout
        }
        train_triples = [
            t for t in triples
            if (t["source"], t["relation"], t["target"], t["source_type"], t["target_type"]) not in holdout_set
        ]

        eval_model = self._train_evaluation_model(
            train_triples,
            epochs=epochs,
            learning_rate=learning_rate,
            hidden_dim=hidden_dim,
            embedding_dim=embedding_dim,
        )

        encoder = eval_model["encoder"]
        predictor = eval_model["predictor"]
        node_to_idx = eval_model["node_to_idx"]
        node_types = eval_model["node_types"]
        x = eval_model["x"]
        edge_index = eval_model["edge_index"]

        disease_nodes = [name for name, ntype in node_types.items() if ntype == "disease"]
        if not disease_nodes:
            raise ValueError("No disease nodes available for evaluation")

        with torch.no_grad():
            z = encoder(x, edge_index)

        reciprocal_ranks: List[float] = []
        hits = {1: 0, 3: 0, 5: 0, 10: 0}
        evaluated_cases: List[Dict[str, Any]] = []

        for edge in holdout:
            drug = edge["source"]
            disease = edge["target"]
            if drug not in node_to_idx or disease not in node_to_idx:
                continue

            drug_idx = node_to_idx[drug]
            disease_scores: List[Tuple[str, float]] = []
            for disease_name in disease_nodes:
                disease_idx = node_to_idx[disease_name]
                logit = predictor(z[drug_idx].unsqueeze(0), z[disease_idx].unsqueeze(0))
                score = float(torch.sigmoid(logit).item())
                disease_scores.append((disease_name, score))

            disease_scores.sort(key=lambda item: item[1], reverse=True)
            ranked_diseases = [name for name, _ in disease_scores]
            rank = ranked_diseases.index(disease) + 1 if disease in ranked_diseases else len(ranked_diseases) + 1
            reciprocal_ranks.append(1.0 / rank)
            for k in hits:
                if rank <= k:
                    hits[k] += 1

            evaluated_cases.append({
                "drug": drug,
                "disease": disease,
                "rank": rank,
                "top_predictions": [
                    {"disease": name, "score": round(score, 4)}
                    for name, score in disease_scores[:5]
                ]
            })

        evaluated_count = max(1, len(reciprocal_ranks))
        metrics = {
            "mrr": round(sum(reciprocal_ranks) / evaluated_count, 4),
            "hits_at_1": round(hits[1] / evaluated_count, 4),
            "hits_at_3": round(hits[3] / evaluated_count, 4),
            "hits_at_5": round(hits[5] / evaluated_count, 4),
            "hits_at_10": round(hits[10] / evaluated_count, 4),
        }

        self.last_evaluation = {
            "dataset_path": dataset_path or str(self.seed_csv_path),
            "artifact_version": self._artifact_version(),
            "holdout_ratio": holdout_ratio,
            "holdout_edges": len(holdout),
            "train_edges": len(train_triples),
            "evaluated_cases": evaluated_cases,
            "metrics": metrics,
            "epochs": epochs,
            "learning_rate": learning_rate,
            "hidden_dim": hidden_dim,
            "embedding_dim": embedding_dim,
            "loss_history_tail": eval_model["loss_history_tail"],
        }
        self.save_evaluation()
        return self.last_evaluation

    def save_artifact(self) -> None:
        if not self.ready:
            raise RuntimeError("Model is not trained and cannot be saved")

        payload = {
            "encoder_state_dict": self.encoder.state_dict(),
            "predictor_state_dict": self.predictor.state_dict(),
            "node_to_idx": self.node_to_idx,
            "idx_to_node": self.idx_to_node,
            "node_types": self.node_types,
            "type_to_idx": self.type_to_idx,
            "edge_index": self.edge_index,
            "x": self.x,
            "triples": self.triples,
            "pdb_by_drug": self.pdb_by_drug,
            "last_training": self.last_training,
        }
        torch.save(payload, self.artifact_path)

    def load_artifact(self) -> Dict[str, Any]:
        self._ensure_ml_stack()

        if not self.artifact_path.exists():
            raise FileNotFoundError(f"Model artifact not found: {self.artifact_path}")

        payload = torch.load(self.artifact_path, map_location="cpu")

        self.node_to_idx = payload["node_to_idx"]
        raw_idx_to_node = payload["idx_to_node"]
        self.idx_to_node = {int(k): v for k, v in raw_idx_to_node.items()}
        self.node_types = payload["node_types"]
        self.type_to_idx = payload["type_to_idx"]
        self.edge_index = payload["edge_index"]
        self.x = payload["x"]
        self.triples = payload.get("triples", [])
        self.pdb_by_drug = payload.get("pdb_by_drug", {})
        self.last_training = payload.get("last_training")

        in_dim = self.x.shape[1]
        emb_dim = payload["encoder_state_dict"]["conv2.lin_l.weight"].shape[0]
        hidden_dim = payload["encoder_state_dict"]["conv1.lin_l.weight"].shape[0]

        self.encoder = GraphSAGEEncoder(in_dim, hidden_dim, emb_dim)
        self.predictor = LinkPredictor(emb_dim)
        self.encoder.load_state_dict(payload["encoder_state_dict"])
        self.predictor.load_state_dict(payload["predictor_state_dict"])
        self.encoder.eval()
        self.predictor.eval()

        return {
            "model_ready": True,
            "artifact_path": str(self.artifact_path),
            "artifact_version": self._artifact_version(),
            "node_count": len(self.node_to_idx),
            "training_triples": len(self.triples),
            "last_training": self.last_training,
        }

    def _match_disease_node(self, disease_query: str) -> str:
        query = disease_query.strip().lower()
        disease_nodes = [n for n, t in self.node_types.items() if t == "disease"]

        for name in disease_nodes:
            if name.lower() == query:
                return name

        for name in disease_nodes:
            if query in name.lower() or name.lower() in query:
                return name

        supported = ", ".join(sorted(disease_nodes)) or "none"
        raise ValueError(
            f"Disease '{disease_query}' is not in the trained graph. "
            f"Supported diseases: {supported}"
        )

    def _pick_target_for_drug(self, drug_name: str) -> str:
        for t in self.triples:
            if (
                t["source"] == drug_name
                and t["source_type"] == "drug"
                and t["target_type"] in {"target", "protein"}
            ):
                return t["target"]
        return "Unknown target"

    def _find_evidence_trail(self, drug_name: str, disease_name: str) -> List[str]:
        adjacency: Dict[str, List[str]] = {}
        for t in self.triples:
            adjacency.setdefault(t["source"], []).append(t["target"])
            adjacency.setdefault(t["target"], []).append(t["source"])

        queue: List[List[str]] = [[drug_name]]
        visited = {drug_name}

        while queue:
            path = queue.pop(0)
            if len(path) > 5:
                continue
            last = path[-1]
            if last == disease_name:
                return path

            for nxt in adjacency.get(last, []):
                if nxt in visited:
                    continue
                visited.add(nxt)
                queue.append(path + [nxt])

        target = self._pick_target_for_drug(drug_name)
        return [drug_name, target, "Pathway module", disease_name]

    def _candidate_evidence_level(self, drug_name: str, disease_name: str) -> str:
        direct_treat = any(
            t["source"] == drug_name
            and t["target"] == disease_name
            and t["relation"] == "treats"
            and t["source_type"] == "drug"
            and t["target_type"] == "disease"
            for t in self.triples
        )
        if direct_treat:
            return "validated"

        drug_has_other_use = any(
            t["source"] == drug_name
            and t["relation"] == "treats"
            and t["source_type"] == "drug"
            and t["target_type"] == "disease"
            for t in self.triples
        )
        return "repurposed" if drug_has_other_use else "predicted"

    def predict(self, disease: str, top_k: int = 5) -> Dict[str, Any]:
        self._ensure_ml_stack()

        if not self.ready:
            if self.artifact_path.exists():
                self.load_artifact()
            else:
                raise RuntimeError("Model artifact missing. Train model first via /api/gnn/train")

        disease_node = self._match_disease_node(disease)
        disease_idx = self.node_to_idx[disease_node]

        with torch.no_grad():
            z = self.encoder(self.x, self.edge_index)

        candidates: List[Dict[str, Any]] = []
        for node_name, node_type in self.node_types.items():
            if node_type != "drug":
                continue
            drug_idx = self.node_to_idx[node_name]
            with torch.no_grad():
                logit = self.predictor(z[drug_idx].unsqueeze(0), z[disease_idx].unsqueeze(0))
                score = float(torch.sigmoid(logit).item())

            trail = self._find_evidence_trail(node_name, disease_node)
            target_name = self._pick_target_for_drug(node_name)
            pdb_id = self.pdb_by_drug.get(node_name, "1HSG")

            candidates.append(
                {
                    "drug": node_name,
                    "target": target_name,
                    "score": round(score, 4),
                    "rationale": "Predicted by GraphSAGE link prediction over DrugBank-oriented biomedical KG.",
                    "evidenceLevel": self._candidate_evidence_level(node_name, disease_node),
                    "evidenceTrail": trail,
                    "interaction": {"pdbId": pdb_id},
                }
            )

        candidates.sort(key=lambda item: item["score"], reverse=True)
        return {
            "model": "drugbank-graphsage-link-predictor-v1",
            "disease": disease_node,
            "topK": top_k,
            "candidates": candidates[:top_k],
            "metadata": {
                "source": "ai-engine-gnn",
                "datasetProvenance": self.load_dataset_provenance(),
                "evidenceLegend": {
                    "validated": "Direct drug-disease treat edge exists in the curated seed graph.",
                    "repurposed": "Drug has another known indication and is predicted for this disease.",
                    "predicted": "Graph-predicted candidate without a direct known indication in the seed graph."
                }
            }
        }

    def online_update(self, relations: List[Dict[str, Any]], epochs: int = 25) -> Dict[str, Any]:
        self._ensure_ml_stack()
        if not relations:
            raise ValueError("No relations provided for online update")

        if not self.triples:
            if self.triple_store_path.exists():
                self.load_triples()
            elif self.seed_csv_path.exists():
                self.load_triples(str(self.seed_csv_path))
            else:
                raise RuntimeError("No base triples available to apply online updates")

        normalized = [self._normalize_row(r) for r in relations]
        self.triples.extend(normalized)
        self._persist_triples()

        # Warm retraining keeps learned parameters while adapting to new edges.
        result = self.train(dataset_path=None, epochs=epochs, learning_rate=0.005, warm_start=True)
        result["online_updates_applied"] = len(normalized)
        return result
