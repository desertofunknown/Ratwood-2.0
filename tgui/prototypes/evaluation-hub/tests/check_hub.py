#!/usr/bin/env python3
"""Isolated, dependency-free contracts for the disconnected static hub."""
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from urllib.parse import urlsplit

HUB = Path(__file__).resolve().parents[1]
REPO = HUB.parents[2]
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(root):
    return {p.relative_to(root).as_posix(): digest(p)
            for p in sorted(root.rglob('*')) if p.is_file()}


class Element:
    def __init__(self, tag, attrs=(), parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []

    def is_within(self, ancestor):
        current = self.parent
        while current is not None:
            if current is ancestor:
                return True
            current = current.parent
        return False

    @property
    def text(self):
        return ' '.join(' '.join(c.text if isinstance(c, Element) else c
                                for c in self.children).split())


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Element('document')
        self.stack = [self.root]
        self.elements = []
        self.errors = []
        self.feed(html)
        if len(self.stack) != 1:
            self.errors.append('Unclosed tags: ' + ', '.join(e.tag for e in self.stack[1:]))

    def handle_starttag(self, tag, attrs):
        element = Element(tag, attrs, self.stack[-1])
        self.stack[-1].children.append(element)
        self.elements.append(element)
        if len(dict(attrs)) != len(attrs):
            self.errors.append('Duplicate attributes on ' + tag)
        if tag not in VOID:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if len(self.stack) < 2 or self.stack[-1].tag != tag:
            self.errors.append('Mismatched closing tag: ' + tag)
        else:
            self.stack.pop()

    def handle_data(self, text):
        self.stack[-1].children.append(text)

    def select(self, tag):
        return [e for e in self.elements if e.tag == tag]


class HubContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node = shutil.which('node') or shutil.which('bun')
        if not cls.node:
            raise RuntimeError('An existing Node or Bun runtime is required; nothing is installed by this suite.')
        names = subprocess.check_output(['git', 'ls-files', '-z', 'tgui'], cwd=REPO).decode().split('\0')
        cls.protected = [REPO / n for n in names if n and not n.startswith('tgui/prototypes/evaluation-hub/')]
        cls.before = {str(p): digest(p) for p in cls.protected if p.is_file()}
        base = HUB / '.test-build'
        base.mkdir(exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(prefix='contracts-', dir=base)
        cls.addClassCleanup(cls.temp.cleanup)
        cls.first = Path(cls.temp.name) / 'first'
        cls.second = Path(cls.temp.name) / 'second'
        script = "import {buildHub} from './build.mjs'; await buildHub({outputDir:process.argv[1]});"
        for output in (cls.first, cls.second):
            subprocess.run([cls.node, '--input-type=module', '-e', script, str(output)],
                           cwd=HUB, check=True, capture_output=True, text=True)
        cls.html = (cls.first / 'index.html').read_text()
        cls.doc = Document(cls.html)
        cls.manifest = json.loads((cls.first / 'manifest.json').read_text())
        cls.approved = json.loads((HUB / 'approved-routes.json').read_text())

    def test_reproducible_build_and_protected_sources(self):
        self.assertEqual(snapshot(self.first), snapshot(self.second))
        self.assertEqual(self.before, {str(p): digest(p) for p in self.protected if p.is_file()},
                         'The hub build changed tracked production or frozen prototype files')

    def test_semantics_and_keyboard_navigation(self):
        self.assertEqual(self.doc.errors, [])
        self.assertEqual(len(self.doc.select('html')), 1)
        self.assertTrue(self.doc.select('html')[0].attrs.get('lang'))
        self.assertEqual(len(self.doc.select('title')), 1)
        self.assertTrue(self.doc.select('title')[0].text)
        self.assertEqual(len(self.doc.select('main')), 1)
        ids = [e.attrs['id'] for e in self.doc.elements if 'id' in e.attrs]
        self.assertEqual(len(ids), len(set(ids)), 'Duplicate fragment targets')
        headings = [e for e in self.doc.elements if re.fullmatch(r'h[1-6]', e.tag)]
        self.assertEqual(sum(e.tag == 'h1' for e in headings), 1)
        previous = 0
        names = []
        for heading in headings:
            level = int(heading.tag[1])
            self.assertLessEqual(level, previous + 1, 'Skipped heading level')
            self.assertTrue(heading.text)
            names.append(heading.text.casefold())
            previous = level
        self.assertEqual(len(names), len(set(names)), 'Headings should identify distinct sections')
        anchors = self.doc.select('a')
        self.assertTrue(anchors)
        main = self.doc.select('main')[0]
        self.assertEqual(anchors[0].attrs.get('href'), '#' + main.attrs.get('id', ''), 'First link must skip to main')
        self.assertIn('skip', anchors[0].text.lower())
        for element in self.doc.elements:
            if 'tabindex' in element.attrs:
                self.assertLessEqual(int(element.attrs['tabindex']), 0, 'Do not reorder keyboard traversal')
        for anchor in anchors:
            self.assertTrue(anchor.attrs.get('aria-label') or anchor.text, 'Unnamed link')
            href = anchor.attrs.get('href', '')
            self.assertTrue(href, 'Anchor missing destination')
            if href.startswith('#'):
                self.assertIn(href[1:], ids)
            self.assertNotEqual(anchor.attrs.get('target'), '_blank', 'Keep study navigation predictable')

    def test_static_safety_and_csp(self):
        blocked = {'script', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'frame', 'object', 'embed', 'base', 'audio', 'video'}
        self.assertFalse(blocked.intersection(e.tag for e in self.doc.elements))
        for element in self.doc.elements:
            for key, value in element.attrs.items():
                self.assertFalse(key.startswith('on'), 'Executable HTML event attribute')
                self.assertNotIn(key, {'srcdoc', 'ping', 'action', 'formaction'})
                if key in {'src', 'href', 'poster'}:
                    url = urlsplit(value)
                    self.assertFalse(url.scheme or url.netloc, 'Remote or executable resource URL')
        policies = [e.attrs.get('content', '') for e in self.doc.select('meta')
                    if e.attrs.get('http-equiv', '').lower() == 'content-security-policy']
        self.assertEqual(len(policies), 1)
        policy = dict((parts[0], parts[1:]) for directive in policies[0].split(';')
                      if (parts := directive.split()))
        for directive in ('default-src', 'script-src', 'connect-src', 'object-src', 'base-uri', 'form-action'):
            self.assertEqual(policy.get(directive), ["'none'"], directive)
        self.assertNotIn("'unsafe-inline'", policy.get('script-src', []))
        for css in self.first.glob('*.css'):
            content = css.read_text()
            self.assertNotRegex(content, r'(?i)@import|url\s*\(|expression\s*\(')
        self.assertFalse(any(p.suffix in {'.js', '.mjs', '.cjs', '.wasm'}
                             for p in self.first.iterdir()), 'No executable client artifacts')
        self.assertNotRegex(self.html, r'(?i)byond://|localStorage|sessionStorage|indexedDB|serviceWorker|websocket')

    def test_verified_routes_exact_pairs_and_journey_groups(self):
        prefixes = {
            'crafting-workbench': 'integration',
            'display-readability': 'display-readability',
            'alert-prompt': 'alert-prompt',
            'selection-prompt': 'selection-prompt',
            'value-prompts': 'value-prompts',
            'market-quote': 'market-quote',
            'treasury-ledger': 'treasury',
            'changes-archive': 'changes',
        }
        expected = {f'{study}-{framework}': f'/{prefix}/{framework}/'
                    for study, prefix in prefixes.items() for framework in ('react', 'svelte')}
        expected.update({f'crafting-standalone-{framework}': f'/{framework}/'
                         for framework in ('react', 'svelte', 'lua')})
        self.assertEqual(self.approved['status'], 'verified')
        self.assertEqual(self.approved['hubPath'], '/evaluation/')
        self.assertEqual(len(self.approved['routes']), len(expected))
        self.assertEqual({r['id']: r['path'] for r in self.approved['routes']}, expected)
        self.assertEqual({r['id']: r['path'] for r in self.manifest['routes']}, expected)
        hrefs = {key: '..' + path for key, path in expected.items()}
        self.assertEqual({r['id']: r['href'] for r in self.manifest['routes']}, hrefs)
        links = [a for a in self.doc.select('a') if a.attrs.get('href', '').startswith('../')]
        self.assertEqual(sorted(a.attrs['href'] for a in links), sorted(hrefs.values()))
        names = [a.attrs.get('aria-label') or a.text for a in links]
        self.assertEqual(len(names), len(set(names)), 'Study links need unique accessible names')
        for anchor in self.doc.select('a'):
            href = anchor.attrs['href']
            if not href.startswith(('#', '../')):
                self.assertTrue((self.first / href).is_file(), 'Broken local document link: ' + href)
        groups = [s for s in self.doc.select('section') if 'journey' in s.attrs.get('class', '').split()]
        self.assertEqual(len(groups), 3)
        cards = self.doc.select('article')
        self.assertEqual(len(cards), len(prefixes))
        for study in prefixes:
            matches = [card for card in cards if card.attrs.get('aria-labelledby') == study + '-title']
            self.assertEqual(len(matches), 1, study)
            card = matches[0]
            self.assertEqual(sum(card.is_within(group) for group in groups), 1)
            card_links = [a for a in links if a.is_within(card)]
            self.assertEqual({a.attrs['href'] for a in card_links},
                             {hrefs[study + '-react'], hrefs[study + '-svelte']}, study)
        research = [s for s in self.doc.select('section') if s.attrs.get('id') == 'research']
        self.assertEqual(len(research), 1)
        self.assertNotIn(research[0], groups)
        research_links = [a for a in links if a.is_within(research[0])]
        self.assertEqual({a.attrs['href'] for a in research_links}, {'../react/', '../svelte/', '../lua/'})

    def test_registry_rejects_invalid_inventory(self):
        script = """
import {validateRegistry} from './build.mjs';
import {readFileSync} from 'node:fs';
const original = JSON.parse(readFileSync('approved-routes.json', 'utf8'));
const cases = [
  x => { x.status = 'pending'; },
  x => { x.routes.pop(); },
  x => { x.routes.push(x.routes[0]); },
  x => { x.routes[0].id = 'invented-study'; },
  x => { x.routes[0].path = 'https://example.com/'; },
  x => { x.routes[0].path = '//example.com/'; },
  x => { x.routes[0].path = '/../../game/'; },
  x => { x.routes[0].path = 'javascript:alert(1)'; },
  x => { x.routes[0].path = x.hubPath; },
  x => { x.routes[0].path = x.routes[1].path; },
  x => { x.hubPath = '/evaluation/?token=secret'; },
];
for (const [index, change] of cases.entries()) {
  const candidate = structuredClone(original); change(candidate);
  let rejected = false;
  try { validateRegistry(candidate); } catch { rejected = true; }
  if (!rejected) throw Error('Unsafe inventory accepted, case ' + index);
}
"""
        result = subprocess.run([self.node, '--input-type=module', '-e', script],
                                cwd=HUB, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_packaged_sources_rebuild_identically(self):
        copied = Path(self.temp.name) / 'source-rebuild'
        shutil.copytree(self.first / 'source', copied)
        hub = copied / 'tgui/prototypes/evaluation-hub'
        output = hub / '.test-build/rebuild'
        script = "import {buildHub} from './build.mjs'; await buildHub({outputDir:process.argv[1]});"
        subprocess.run([self.node, '--input-type=module', '-e', script, str(output)],
                       cwd=hub, check=True, capture_output=True, text=True)
        self.assertEqual(snapshot(self.first), snapshot(output))

    def test_manifest_integrity_and_source_mirror(self):
        manifest = self.manifest
        self.assertIs(manifest['clientJavaScript'], False)
        self.assertEqual(manifest['dependencies'], [])
        artifact_paths = []
        for entry in manifest['artifacts']:
            path = entry['path']
            self.assertFalse(Path(path).is_absolute())
            self.assertNotIn('..', Path(path).parts)
            artifact = self.first / path
            self.assertTrue(artifact.is_file(), path)
            self.assertEqual(digest(artifact), entry['sha256'], path)
            self.assertEqual(artifact.stat().st_size, entry['bytes'], path)
            artifact_paths.append(path)
        self.assertEqual(len(artifact_paths), len(set(artifact_paths)))
        sources = []
        for entry in manifest['sources']:
            path = entry['path']
            self.assertFalse(Path(path).is_absolute())
            self.assertNotIn('..', Path(path).parts)
            self.assertEqual(digest(REPO / path), entry['sha256'], path)
            mirror = 'source/' + path
            self.assertEqual((REPO / path).read_bytes(), (self.first / mirror).read_bytes(), path)
            sources.append(mirror)
        self.assertEqual(len(sources), len(set(sources)))
        self.assertEqual(set(snapshot(self.first)), set(artifact_paths) | set(sources) | {'manifest.json'},
                         'Every output must be accounted for')
        self.assertIn('tgui/prototypes/evaluation-hub/build.mjs', [e['path'] for e in manifest['sources']])
        self.assertIn('tgui/prototypes/evaluation-hub/approved-routes.json', [e['path'] for e in manifest['sources']])
        for name in ('LICENSE.txt', 'NOTICE.txt'):
            self.assertTrue((self.first / name).read_text().strip())


if __name__ == '__main__':
    unittest.main(verbosity=2)
