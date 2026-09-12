#!/usr/bin/env python3
"""Credential-free contract check for .db-providers.json and the supabase/ + neon/ overlays (DEN-4075)."""
import json, pathlib, re, sys, tomllib

import jsonschema

root = pathlib.Path(__file__).resolve().parent.parent
errors = []
doc = json.loads((root / ".db-providers.json").read_text())
schema = json.loads((root / "config/db-providers.schema.json").read_text())
for e in jsonschema.Draft202012Validator(schema).iter_errors(doc):
    errors.append(f"schema: {'/'.join(map(str, e.path))}: {e.message}")

ns = doc["githubOrg"].lower().replace("-", "_")
mig_name = re.compile(r"^[0-9]{14}_[a-z0-9_]+\.sql$")
secretish = re.compile(r"(sb_secret_|service_role\s*=|eyJhbGciOi|postgres(ql)?://[^\s:]+:[^\s@]+@|napi_[a-z0-9]{20,})", re.I)

for project in doc.get("supabase", {}).get("projects", []):
    wd = root / project["workingDirectory"] / "supabase"
    if not (wd / "config.toml").is_file():
        errors.append(f"{wd}: missing config.toml")
        continue
    tomllib.loads((wd / "config.toml").read_text())
    for sql in sorted((wd / "migrations").glob("*.sql")):
        if not mig_name.match(sql.name):
            errors.append(f"{sql}: migration name must be <yyyymmddhhmmss>_<snake>.sql")
        if f"create schema if not exists {ns}" not in sql.read_text() and not list((wd / "migrations").glob("*_namespace.sql")):
            errors.append(f"{sql}: overlay must create/scope namespace {ns}")

for project in doc.get("neon", {}).get("projects", []):
    if not (root / project["directory"] / "terraform" / ".terraform.lock.hcl").is_file():
        errors.append(f"{project['directory']}: missing terraform lock file")

for path in list(root.glob("supabase/**/*")) + list(root.glob("neon/**/*")) + [root / ".db-providers.json"]:
    if path.is_file() and ".terraform" not in path.parts and secretish.search(path.read_text(errors="ignore")):
        errors.append(f"{path.relative_to(root)}: credential-shaped literal")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print("db-providers contract OK")
