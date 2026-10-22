"""Exercise real writer call sites using disposable, one-tile maps only.

PYTHONPATH=tools python -B -m unittest mapmerge2.test_writer_callers

mapmerge's backup merge is documented in this directory's README. The legacy
update_paths.py still has a direct-script CLI, distinct from tools/UpdatePaths.
"""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from mapmerge2.dmm import Coordinate, DMM


TOOLS = Path(__file__).resolve().parents[1]


def one_tile(atom, key=0):
    result = DMM(1, Coordinate(1, 1, 1))
    result.dictionary[key] = (atom, '/turf/open', '/area/test')
    result.grid[1, 1, 1] = key
    return result


class WriterCallerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='map-writer-callers-')
        self.addCleanup(temporary.cleanup)
        self.work = Path(temporary.name)
        self.unselected = self.work / 'unselected.dmm'
        self.unselected.write_bytes(one_tile('/obj/unselected').to_bytes(tgm=False))
        self.unselected_bytes = self.unselected.read_bytes()

    def run_cli(self, arguments, *, tgm=True):
        environment = dict(os.environ, PYTHONPATH=str(TOOLS),
                           PYTHONDONTWRITEBYTECODE='1', MAPROOT=str(self.work),
                           TGM='1' if tgm else '0')
        result = subprocess.run(
            [sys.executable, '-B', *arguments], cwd=self.work, env=environment,
            input='\n', text=True, capture_output=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.unselected.read_bytes(), self.unselected_bytes)

    def assert_merge(self, tgm):
        target = self.work / 'merge.dmm'
        backup = self.work / 'merge.dmm.backup'
        old_bytes = one_tile('/obj/old').to_bytes(tgm=False)
        new_bytes = one_tile('/obj/new', key=1).to_bytes(tgm=False)
        target.write_bytes(new_bytes)
        backup.write_bytes(old_bytes)

        self.run_cli(['-m', 'mapmerge2.mapmerge', str(target)], tgm=tgm)

        # The merge preserves the old dictionary key and the edited atom.
        self.assertEqual(target.read_bytes(), one_tile('/obj/new').to_bytes(tgm=tgm))
        self.assertEqual(backup.read_bytes(), old_bytes)
        self.assertEqual((self.work / 'merge.dmm.before').read_bytes(), new_bytes)

    def test_mapmerge_forwards_tgm_true(self):
        self.assert_merge(True)

    def test_mapmerge_forwards_tgm_false(self):
        self.assert_merge(False)

    def assert_update(self, inline):
        target = self.work / 'update.dmm'
        target.write_bytes(one_tile('/obj/old').to_bytes(tgm=False))
        arguments = [str(TOOLS / 'mapmerge2' / 'update_paths.py'), '--map', str(target)]
        replacement = '/obj/old : /obj/new'
        if inline:
            arguments.extend(['--inline', replacement])
        else:
            rules = self.work / 'updates.txt'
            rules.write_text('# Fixture update\n\n' + replacement + '\n', encoding='utf-8')
            arguments.append(str(rules))

        # This CLI always writes TGM, independently of the frontend setting.
        self.run_cli(arguments, tgm=False)

        self.assertEqual(target.read_bytes(), one_tile('/obj/new').to_bytes(tgm=True))

    def test_update_paths_inline_writes_tgm(self):
        self.assert_update(True)

    def test_update_paths_file_writes_tgm(self):
        self.assert_update(False)


if __name__ == '__main__':
    unittest.main()
