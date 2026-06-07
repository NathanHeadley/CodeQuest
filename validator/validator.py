"""CodeQuest code-validation microservice.

Parses pupil-submitted Python with ast.parse (NEVER executes it) and checks the
syntax tree against the expected pattern for the requested action.

Run (dev):  python validator.py
Run (prod): gunicorn -w 2 -b 127.0.0.1:5001 validator:app
"""
import ast

from flask import Flask, request, jsonify

from patterns import PATTERNS

app = Flask(__name__)

MAX_CODE_LEN = 2000


@app.get("/health")
def health():
    return {"status": "ok", "actions": sorted(PATTERNS.keys())}


@app.post("/validate")
def validate():
    data = request.get_json(silent=True) or {}
    action = (data.get("action_name") or "").strip()
    code = (data.get("code") or "").strip()

    if action not in PATTERNS:
        return jsonify(valid=False, feedback=f"Unknown action '{action}'."), 400
    if not code:
        return jsonify(valid=False, feedback="You haven't written any code yet.")
    if len(code) > MAX_CODE_LEN:
        return jsonify(valid=False, feedback="That's a lot of code -- try a single line for this action.")

    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as e:
        return jsonify(valid=False, feedback=f"Python syntax error: {e.msg} (line {e.lineno}).")

    ok, feedback = PATTERNS[action](tree)
    return jsonify(valid=ok, feedback=feedback)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001)
