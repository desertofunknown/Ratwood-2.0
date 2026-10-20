"""Offline integrity check for sanitized numeric fixtures; no original capture needed."""
import hashlib,json,pathlib
b=pathlib.Path(__file__).resolve().parent
manifest=json.loads((b/'FIXTURE-SHA256.json').read_text())
actual={str(p.relative_to(b)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (b/'payloads').glob('*.txt')}
assert actual==manifest,'Fixture file set or digest changed'
cases=json.loads((b/'cases.json').read_text());assert len(cases)==8
names=set()
for c in cases:
 assert c['name'] not in names;names.add(c['name'])
 assert c['file']=='payloads/'+c['name']+'.txt'
 raw=(b/c['file']).read_bytes();assert len(raw)==c['bytes']<=65536
 assert hashlib.sha256(raw).hexdigest()==c['sha256']
 header,*rows=raw.decode('ascii').split(';');fields=header.split('|')
 assert fields[:2]==['2','submit'] and fields[2:9]==c['identity']
 assert len(rows)==c['nodes']==144 and int(fields[10])==144
 dm=c['dm'];assert dm['kind'] in ['false','null','path']
 expected='result|'+'|'.join(c['identity'])+'|'+dm['kind'].capitalize()+'|'+','.join(str(v-1) for v in dm['path'])
 assert expected==c['expected']
assert len(json.loads((b/'bad-cases.json').read_text()))==14
print('Eight captured fixtures and fourteen malformed fixtures verified offline')
