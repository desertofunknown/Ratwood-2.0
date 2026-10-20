"""Verify retained core and extension source inventories without external services."""
import pathlib,json,hashlib
b=pathlib.Path(__file__).resolve().parent;root=b.parent
for manifest in (root/'SOURCE-SHA256.json',b/'SOURCE-SHA256.json'):
 for name,digest in json.loads(manifest.read_text()).items():
  p=root/name;assert p.resolve().is_relative_to(root.resolve())
  assert hashlib.sha256(p.read_bytes()).hexdigest()==digest,name
print('Core and bridge source inventories match')
