"""Compare generated output to frozen controls; native-only mode makes no ABI claim."""
import pathlib,json,sys
b=pathlib.Path(sys.argv[1]);run=pathlib.Path(sys.argv[2]);native_only='--native-only' in sys.argv[3:]
cases=json.loads((b/'cases.json').read_text());direct=(run/'logs/direct.log').read_text().splitlines();seen={}
if not native_only:
 for line in (run/'logs/harness-runtime.log').read_text().splitlines():
  if line.startswith('CASE_RESULT '):
   _,name,result=line.split(' ',2);assert name not in seen;seen[name]=result
 assert len(seen)==8
assert len(cases)==len(direct)==8
rows=[]
for c in cases:
 if not native_only:assert seen[c['name']]==c['expected']
 matching=[x for x in direct if x.startswith(c['file']+'|')];assert len(matching)==1;native=matching[0]
 prefix=c['file']+'|'+'|'.join(c['identity'])+'|';assert native.startswith(prefix)
 expected=c['dm'];kind=expected['kind'].capitalize();path=[v-1 for v in expected['path']]
 assert native[len(prefix):]==f'Ok(({kind}, {path}))',(native,expected)
 rows.append(dict(name=c['name'],status='native-match' if native_only else 'match',identity=c['identity'],dm=expected,wire_bytes=c['bytes']))
(run/'comparison.json').write_text(json.dumps(dict(status='NATIVE_ONLY_PASS' if native_only else 'PASS',cases=rows),indent=2))
print('8/8 direct Rust outcomes match frozen DM controls; no ABI test' if native_only else '8/8 exact frozen DM, direct Rust and BYOND string-ABI outcomes match')
