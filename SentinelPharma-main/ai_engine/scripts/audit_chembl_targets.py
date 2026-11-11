import sqlite3

db_path = "c:/Users/Senthil Kumar/Downloads/chembl_36_sqlite/chembl_36.db"
conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
c = conn.cursor()

# 1. Total targets in ChEMBL
c.execute("SELECT count(tid) FROM target_dictionary;")
print("Total targets in ChEMBL:", c.fetchone()[0])

# 2. Total human targets
c.execute("SELECT count(tid) FROM target_dictionary WHERE organism = 'Homo sapiens';")
print("Total human targets in ChEMBL:", c.fetchone()[0])

# 3. Targets with mechanisms (any drug)
c.execute("SELECT count(DISTINCT tid) FROM drug_mechanism;")
print("Targets with documented mechanism of action:", c.fetchone()[0])

# 4. Targets with mechanisms for clinical/approved drugs (max_phase >= 1)
c.execute("""
    SELECT count(DISTINCT td.chembl_id), count(DISTINCT CASE WHEN td.organism = 'Homo sapiens' THEN td.chembl_id END)
    FROM molecule_dictionary md
    JOIN drug_mechanism dm ON md.molregno = dm.molregno
    JOIN target_dictionary td ON dm.tid = td.tid
    WHERE md.max_phase >= 1;
""")
tot_clin, human_clin = c.fetchone()
print(f"Targets for clinical/approved drugs (max_phase >= 1): {tot_clin} (Human: {human_clin})")

# 5. Targets for all approved drugs (max_phase = 4)
c.execute("""
    SELECT count(DISTINCT td.chembl_id), count(DISTINCT CASE WHEN td.organism = 'Homo sapiens' THEN td.chembl_id END)
    FROM molecule_dictionary md
    JOIN drug_mechanism dm ON md.molregno = dm.molregno
    JOIN target_dictionary td ON dm.tid = td.tid
    WHERE md.max_phase = 4;
""")
tot_app, human_app = c.fetchone()
print(f"Targets for approved drugs (max_phase = 4): {tot_app} (Human: {human_app})")

# 6. Targets associated with clinical drugs via curated mechanism OR direct target assays
c.execute("""
    SELECT count(DISTINCT td.chembl_id)
    FROM molecule_dictionary md
    JOIN drug_mechanism dm ON md.molregno = dm.molregno
    JOIN target_dictionary td ON dm.tid = td.tid;
""")
print(f"All mechanism-backed targets across all compounds: {c.fetchone()[0]}")

conn.close()
