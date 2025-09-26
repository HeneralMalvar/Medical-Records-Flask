from flask import Flask, request, jsonify, render_template
import sqlite3
import pandas as pd

app = Flask(__name__)
DB_FILE = "clinic.db"
CSV_FILE = "clinic.csv"

# ---------- DB Helpers ----------
def get_conn():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    c = conn.cursor()

    # Patients table (no age here)
    c.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sex TEXT
        )
    """)

    # Visits table with extended fields
    c.execute("""
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            visit_date TEXT DEFAULT (datetime('now','localtime')),
            age INTEGER,
            address TEXT,
            status TEXT,
            history TEXT,
            pe TEXT,
            diagnosis TEXT,
            management TEXT,
            FOREIGN KEY (patient_id) REFERENCES patients (id)
        )
    """)

    conn.commit()
    conn.close()
    export_to_csv()  # ensure CSV is built

def query_all(query, args=()):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(query, args)
    rows = cur.fetchall()
    conn.close()
    return rows

def execute(query, args=()):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(query, args)
    conn.commit()
    lastrowid = cur.lastrowid
    conn.close()
    export_to_csv()
    return lastrowid

# ---------- CSV Export ----------
def export_to_csv():
    conn = get_conn()
    df = pd.read_sql_query("""
        SELECT p.id as patient_id, p.name, p.sex,
               v.id as visit_id, v.visit_date, v.age as visit_age,
               v.address, v.status, v.history, v.pe, v.diagnosis, v.management
        FROM patients p
        LEFT JOIN visits v ON p.id = v.patient_id
        ORDER BY p.name COLLATE NOCASE ASC, datetime(v.visit_date) DESC
    """, conn)
    conn.close()
    df.to_csv(CSV_FILE, index=False, encoding="utf-8")

init_db()

# ---------- Routes ----------
@app.route("/")
def index():
    return render_template("index.html")

# ---- Patients ----
@app.route("/api/patients", methods=["POST"])
def create_patient():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400
    sex = data.get("sex") or None
    pid = execute("INSERT INTO patients (name, sex) VALUES (?, ?)", (name, sex))
    return jsonify({"message": "Patient created", "patient_id": pid}), 201

@app.route("/api/patients", methods=["GET"])
def get_patients():
    rows = query_all("SELECT id, name, sex FROM patients ORDER BY name COLLATE NOCASE ASC")
    return jsonify([dict(r) for r in rows])

@app.route("/api/patients/<int:pid>", methods=["GET"])
def get_patient(pid):
    rows = query_all("SELECT id, name, sex FROM patients WHERE id=?", (pid,))
    if not rows:
        return jsonify({"error": "Not found"}), 404
    return jsonify(dict(rows[0]))

@app.route("/api/patients/<int:pid>", methods=["PUT"])
def update_patient(pid):
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400
    sex = data.get("sex") or None
    execute("UPDATE patients SET name=?, sex=? WHERE id=?", (name, sex, pid))
    return jsonify({"message": "Patient updated"})

@app.route("/api/patients/<int:pid>", methods=["DELETE"])
def delete_patient(pid):
    execute("DELETE FROM visits WHERE patient_id=?", (pid,))
    execute("DELETE FROM patients WHERE id=?", (pid,))
    return jsonify({"message": "Patient and their visits deleted"})

@app.route("/api/patients/search", methods=["GET"])
def search_patients():
    q = (request.args.get("q") or "").strip()
    rows = query_all("SELECT id, name, sex FROM patients WHERE name LIKE ? ORDER BY name COLLATE NOCASE ASC", (f"%{q}%",))
    return jsonify([dict(r) for r in rows])

# ---- Visits ----
@app.route("/api/patients/<int:pid>/visits", methods=["POST"])
def add_visit(pid):
    p = query_all("SELECT id FROM patients WHERE id=?", (pid,))
    if not p:
        return jsonify({"error": "Patient not found"}), 404
    data = request.json or {}
    visit_date = data.get("visit_date")
    age = data.get("age") or None
    address = data.get("address") or None
    status = data.get("status") or None
    history = data.get("history") or ""
    pe = data.get("pe") or ""
    diagnosis = data.get("diagnosis") or ""
    management = data.get("management") or ""

    if visit_date:
        vid = execute("""
            INSERT INTO visits (patient_id, visit_date, age, address, status, history, pe, diagnosis, management)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (pid, visit_date, age, address, status, history, pe, diagnosis, management))
    else:
        vid = execute("""
            INSERT INTO visits (patient_id, age, address, status, history, pe, diagnosis, management)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (pid, age, address, status, history, pe, diagnosis, management))
    return jsonify({"message": "Visit added", "visit_id": vid})

@app.route("/api/patients/<int:pid>/visits", methods=["GET"])
def get_visits(pid):
    p = query_all("SELECT id, name FROM patients WHERE id=?", (pid,))
    if not p:
        return jsonify({"error": "Patient not found"}), 404
    rows = query_all("""
        SELECT id, visit_date, age, address, status, history, pe, diagnosis, management
        FROM visits WHERE patient_id=? ORDER BY datetime(visit_date) DESC
    """, (pid,))
    return jsonify([dict(r) for r in rows])

@app.route("/api/visits/<int:vid>", methods=["GET"])
def get_visit(vid):
    rows = query_all("""
        SELECT id, patient_id, visit_date, age, address, status, history, pe, diagnosis, management
        FROM visits WHERE id=?
    """, (vid,))
    if not rows:
        return jsonify({"error": "Visit not found"}), 404
    return jsonify(dict(rows[0]))

@app.route("/api/visits/<int:vid>", methods=["PUT"])
def update_visit(vid):
    data = request.json or {}
    visit_date = data.get("visit_date") or None
    age = data.get("age") or None
    address = data.get("address") or None
    status = data.get("status") or None
    history = data.get("history") or ""
    pe = data.get("pe") or ""
    diagnosis = data.get("diagnosis") or ""
    management = data.get("management") or ""

    if visit_date:
        execute("""
            UPDATE visits
            SET visit_date=?, age=?, address=?, status=?, history=?, pe=?, diagnosis=?, management=?
            WHERE id=?
        """, (visit_date, age, address, status, history, pe, diagnosis, management, vid))
    else:
        execute("""
            UPDATE visits
            SET age=?, address=?, status=?, history=?, pe=?, diagnosis=?, management=?
            WHERE id=?
        """, (age, address, status, history, pe, diagnosis, management, vid))
    return jsonify({"message": "Visit updated"})

@app.route("/api/visits/<int:vid>", methods=["DELETE"])
def delete_visit(vid):
    execute("DELETE FROM visits WHERE id=?", (vid,))
    return jsonify({"message": "Visit deleted"})

if __name__ == "__main__":
    app.run(debug=True)
