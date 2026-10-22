"""Serialize-before-open regressions; all writes use disposable fixtures.

PYTHONPATH=tools python -B -m unittest mapmerge2.test_file_write_integrity

The final write is deliberately NOT atomic. Its failure tests preserve that
limitation rather than claiming that buffering protects against disk errors.
"""

import builtins
import contextlib
import errno
import io
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

from mapmerge2 import dmm
from UpdatePaths.__main__ import update_map


ORIGINAL = b'"a" = (/turf/original,/area/test)\n\n(1,1,1) = {"\na\n"}\n'
SPARSE = ORIGINAL + b'(3,1,1) = {"\na\n"}\n'


def fixture(*, sparse=False):
    source = dmm.DMM(1, dmm.Coordinate(2 if sparse else 1, 1, 1))
    source.dictionary[0] = ('/turf/replacement', '/area/test')
    source.grid[1, 1, 1] = 0
    return source


def legacy_to_file(self, fname, *, tgm=True):
    """Original algorithm at 182d6454d7569e3a38514fed2c8d9c75aaeb27f2; names qualified."""
    self._presave_checks()
    with open(fname, 'w', newline='\n', encoding=dmm.ENCODING) as f:
        (dmm.save_tgm if tgm else dmm.save_dmm)(self, f)


class FailingDestination:
    """Bounded real-file writes with deterministic errors, not disk filling."""
    def __init__(self, output, failure):
        self.output = output
        self.failure = failure
        self.remaining = 24

    def __enter__(self):
        return self

    def write(self, data):
        if self.failure != 'write':
            return self.output.write(data)
        prefix = data[:self.remaining]
        self.output.write(prefix)
        self.output.flush()
        self.remaining -= len(prefix)
        if len(prefix) != len(data):
            raise OSError(errno.ENOSPC, 'injected destination write failure')
        return len(prefix)

    def __exit__(self, *exception):
        try:
            if self.failure == 'flush':
                self.output.flush()
                raise OSError(errno.EIO, 'injected destination flush failure')
        finally:
            self.output.close()
        if self.failure == 'close':
            raise OSError(errno.EIO, 'injected destination close failure')


class FileWriteIntegrityTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='dmm-file-integrity-')
        self.addCleanup(temporary.cleanup)
        self.work = Path(temporary.name)

    def destination(self, name='target.dmm', *, existing=True):
        path = self.work / name
        if existing:
            path.write_bytes(ORIGINAL)
        return path

    def assert_target(self, path, existing):
        if existing:
            self.assertEqual(path.read_bytes(), ORIGINAL)
        else:
            self.assertFalse(path.exists())
        self.assertEqual(set(self.work.iterdir()), {path} if existing else set())

    def test_success_matches_streaming_bytes_both_formats_and_path_types(self):
        source = fixture()
        source.header = '// café 🐉\r\n// next line'
        source.dictionary[0] = ('/obj/test{name = "é; quoted"; dir = 2}',
                                '/turf/replacement', '/area/test')
        for tgm in (True, False):
            reference = self.work / 'reference.dmm'
            legacy_to_file(source, reference, tgm=tgm)
            expected = reference.read_bytes()
            for convert in (lambda p: p, str, os.fsencode):
                for existing in (False, True):
                    with self.subTest(tgm=tgm, path_type=convert, existing=existing):
                        path = self.destination(existing=existing)
                        self.assertIsNone(source.to_file(convert(path), tgm=tgm))
                        self.assertEqual(path.read_bytes(), expected)
                        path.unlink()

    def test_presave_and_to_bytes_and_serializer_each_run_once_before_open(self):
        for tgm in (True, False):
            with self.subTest(tgm=tgm):
                events = []
                source = fixture()
                real_presave = dmm.DMM._presave_checks
                real_to_bytes = dmm.DMM.to_bytes
                writer_name = 'save_tgm' if tgm else 'save_dmm'
                real_writer = getattr(dmm, writer_name)

                def presave(value):
                    events.append('presave')
                    return real_presave(value)

                def serialize(value, **kwargs):
                    events.append('to_bytes')
                    data = real_to_bytes(value, **kwargs)
                    events.append('serialized')
                    return data

                def open_target(*args, **kwargs):
                    events.append('open')
                    self.assertEqual(args[1], 'wb')
                    return builtins.open(*args, **kwargs)

                with patch.object(dmm.DMM, '_presave_checks', autospec=True, side_effect=presave) as checks, \
                     patch.object(dmm.DMM, 'to_bytes', autospec=True, side_effect=serialize) as serializer, \
                     patch.object(dmm, writer_name, wraps=real_writer) as writer, \
                     patch.object(dmm, 'open', side_effect=open_target, create=True):
                    source.to_file(self.work / 'target.dmm', tgm=tgm)
                checks.assert_called_once_with(source)
                serializer.assert_called_once_with(source, tgm=tgm)
                self.assertEqual(writer.call_count, 1)
                self.assertEqual(events, ['to_bytes', 'presave', 'serialized', 'open'])

    def test_to_bytes_override_is_honored_once(self):
        class Override(dmm.DMM):
            def to_bytes(self, *, tgm=True):
                self.calls.append(tgm)
                return b'override\r\n\xc3\xa9\n'
        source = Override(1, dmm.Coordinate(0, 0, 0))
        source.calls = []
        path = self.destination()
        source.to_file(path, tgm=False)
        self.assertEqual(source.calls, [False])
        self.assertEqual(path.read_bytes(), b'override\r\n\xc3\xa9\n')

    def test_missing_grid_keeps_existing_file_or_new_path_absent(self):
        for existing in (True, False):
            with self.subTest(existing=existing):
                path = self.destination(existing=existing)
                with patch.object(dmm, 'open', wraps=builtins.open, create=True) as opener:
                    with self.assertRaises(KeyError) as error:
                        fixture(sparse=True).to_file(path)
                self.assertEqual(error.exception.args, ((2, 1, 1),))
                opener.assert_not_called()
                self.assert_target(path, existing)
                if existing:
                    path.unlink()

    def test_encoding_failure_never_opens_destination_in_both_formats(self):
        for tgm in (True, False):
            for existing in (True, False):
                with self.subTest(tgm=tgm, existing=existing):
                    path = self.destination(existing=existing)
                    source = fixture()
                    source.header = '// invalid surrogate \ud800'
                    with patch.object(dmm, 'open', wraps=builtins.open, create=True) as opener:
                        with self.assertRaises(UnicodeEncodeError):
                            source.to_file(path, tgm=tgm)
                    opener.assert_not_called()
                    self.assert_target(path, existing)
                    if existing:
                        path.unlink()

    def test_presave_failure_does_not_open_destination(self):
        path = self.destination()
        source = fixture()
        source.dictionary[0] = (123,)
        with patch.object(dmm, 'open', wraps=builtins.open, create=True) as opener:
            with self.assertRaises(AttributeError):
                source.to_file(path)
        opener.assert_not_called()
        self.assert_target(path, True)

    def test_presave_mutations_survive_later_serialization_failure(self):
        path = self.destination()
        source = fixture(sparse=True)
        source.dictionary[0] = ('/area/test', '/turf/replacement')
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(KeyError):
            source.to_file(path)
        self.assertEqual(source.dictionary[0], ('/turf/replacement', '/area/test'))
        self.assert_target(path, True)

    def test_memory_allocation_failure_does_not_open_destination(self):
        for existing in (True, False):
            with self.subTest(existing=existing):
                path = self.destination(existing=existing)
                with patch.object(dmm.io, 'BytesIO', side_effect=MemoryError('injected buffer allocation')), \
                     patch.object(dmm, 'open', wraps=builtins.open, create=True) as opener:
                    with self.assertRaises(MemoryError):
                        fixture().to_file(path)
                opener.assert_not_called()
                self.assert_target(path, existing)
                if existing:
                    path.unlink()

    def test_buffer_stream_failure_does_not_open_destination(self):
        path = self.destination()
        for tgm in (True, False):
            with self.subTest(tgm=tgm):
                writer_name = 'save_tgm' if tgm else 'save_dmm'
                def fail_after_prefix(source, output):
                    output.write('partial buffered output')
                    raise OSError(errno.ENOSPC, 'injected buffer failure')
                with patch.object(dmm, writer_name, side_effect=fail_after_prefix), \
                     patch.object(dmm, 'open', wraps=builtins.open, create=True) as opener:
                    with self.assertRaises(OSError):
                        fixture().to_file(path, tgm=tgm)
                opener.assert_not_called()
                self.assert_target(path, True)

    def test_buffer_flush_and_close_failures_do_not_open_destination(self):
        text_wrapper = io.TextIOWrapper
        for tgm in (True, False):
            for failure in ('flush', 'close'):
                for existing in (True, False):
                    with self.subTest(tgm=tgm, failure=failure, existing=existing):
                        path = self.destination(existing=existing)

                        class FailingBuffer:
                            def __init__(self, *args, **kwargs):
                                self.output = text_wrapper(*args, **kwargs)
                            def __enter__(self):
                                return self
                            def write(self, data):
                                return self.output.write(data)
                            def flush(self):
                                self.output.flush()
                                if failure == 'flush':
                                    raise OSError(errno.EIO, 'injected buffer flush failure')
                            def __exit__(self, *exception):
                                self.output.close()
                                if failure == 'close':
                                    raise OSError(errno.EIO, 'injected buffer close failure')

                        with patch.object(dmm.io, 'TextIOWrapper', FailingBuffer), \
                             patch.object(dmm, 'open', wraps=builtins.open, create=True) as opener:
                            with self.assertRaises(OSError):
                                fixture().to_file(path, tgm=tgm)
                        opener.assert_not_called()
                        self.assert_target(path, existing)
                        if existing:
                            path.unlink()

    def test_actual_updatepaths_sparse_failure_preserves_original(self):
        path = self.destination()
        path.write_bytes(SPARSE)
        parsed = dmm.DMM.from_file(path)
        self.assertEqual(parsed.size, (3, 1, 1))
        self.assertEqual(len(parsed.grid), 2)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(KeyError):
            update_map(path, ['/turf/original : /turf/replacement'])
        self.assertEqual(path.read_bytes(), SPARSE)
        self.assertEqual(set(self.work.iterdir()), {path})

    def test_actual_updatepaths_baseline_reproduces_truncation(self):
        path = self.destination()
        path.write_bytes(SPARSE)
        with patch.object(dmm.DMM, 'to_file', legacy_to_file), \
             contextlib.redirect_stdout(io.StringIO()), self.assertRaises(KeyError):
            update_map(path, ['/turf/original : /turf/replacement'])
        self.assertNotEqual(path.read_bytes(), SPARSE)
        self.assertFalse(path.read_bytes().endswith(b'"}\n'))
        self.assertEqual(set(self.work.iterdir()), {path})

    def test_streaming_baseline_encoding_failure_truncates(self):
        for tgm in (True, False):
            with self.subTest(tgm=tgm):
                path = self.destination()
                source = fixture()
                source.header = '// invalid surrogate \ud800'
                with self.assertRaises(UnicodeEncodeError):
                    legacy_to_file(source, path, tgm=tgm)
                prefix = (dmm.TGM_HEADER + '\n').encode(dmm.ENCODING) if tgm else b''
                self.assertEqual(path.read_bytes(), prefix)

    def test_dmm_missing_grid_still_succeeds_with_same_incomplete_output(self):
        expected = self.work / 'reference.dmm'
        path = self.destination()
        with contextlib.redirect_stdout(io.StringIO()) as baseline_stdout:
            legacy_to_file(fixture(sparse=True), expected, tgm=False)
        with contextlib.redirect_stdout(io.StringIO()) as actual_stdout:
            fixture(sparse=True).to_file(path, tgm=False)
        self.assertEqual(path.read_bytes(), expected.read_bytes())
        self.assertEqual(actual_stdout.getvalue(), baseline_stdout.getvalue())
        self.assertEqual(actual_stdout.getvalue(), 'Key error: (2, 1, 1)\n')

    def test_destination_write_flush_close_errors_are_still_not_atomic(self):
        for tgm in (True, False):
            expected = fixture().to_bytes(tgm=tgm)
            for failure in ('write', 'flush', 'close'):
                for existing in (True, False):
                    with self.subTest(tgm=tgm, failure=failure, existing=existing):
                        path = self.destination(existing=existing)
                        def failing_open(*args, **kwargs):
                            return FailingDestination(builtins.open(*args, **kwargs), failure)
                        with patch.object(dmm, 'open', side_effect=failing_open, create=True):
                            with self.assertRaises(OSError):
                                fixture().to_file(path, tgm=tgm)
                        self.assertEqual(path.read_bytes(), expected[:24] if failure == 'write' else expected)
                        self.assertNotEqual(path.read_bytes(), ORIGINAL)
                        path.unlink()

    @unittest.skipUnless(os.name == 'posix', 'POSIX inode and mode assertions')
    def test_existing_inode_owner_group_and_mode_are_retained(self):
        for tgm in (True, False):
            path = self.destination()
            path.chmod(0o640)
            before = path.stat()
            fixture().to_file(path, tgm=tgm)
            after = path.stat()
            self.assertEqual((after.st_dev, after.st_ino, after.st_uid, after.st_gid,
                              after.st_nlink, stat.S_IMODE(after.st_mode)),
                             (before.st_dev, before.st_ino, before.st_uid, before.st_gid,
                              before.st_nlink, stat.S_IMODE(before.st_mode)))

    def test_symlink_and_hardlink_alias_semantics_are_retained(self):
        for link in (os.symlink, os.link):
            for tgm in (True, False):
                with self.subTest(link=link.__name__, tgm=tgm):
                    target = self.destination()
                    alias = self.work / 'alias.dmm'
                    try:
                        link(target, alias)
                    except OSError as error:
                        if os.name == 'nt' and getattr(error, 'winerror', None) == 1314:
                            self.skipTest('Creating symlinks requires Windows developer mode or privilege')
                        raise
                    before = target.stat()
                    fixture().to_file(alias, tgm=tgm)
                    self.assertEqual(target.read_bytes(), fixture().to_bytes(tgm=tgm))
                    self.assertEqual(alias.read_bytes(), target.read_bytes())
                    self.assertEqual(target.stat().st_ino, before.st_ino)
                    self.assertEqual(alias.is_symlink(), link is os.symlink)
                    alias.unlink()

    def test_dangling_symlink_still_creates_referent(self):
        target = self.destination(existing=False)
        alias = self.work / 'alias.dmm'
        try:
            os.symlink(target, alias)
        except OSError as error:
            if os.name == 'nt' and getattr(error, 'winerror', None) == 1314:
                self.skipTest('Creating symlinks requires Windows developer mode or privilege')
            raise
        fixture().to_file(alias)
        self.assertTrue(alias.is_symlink())
        self.assertEqual(target.read_bytes(), fixture().to_bytes())

    @unittest.skipUnless(os.name == 'posix', 'POSIX creation umask')
    def test_new_file_mode_obeys_umask_like_original_open(self):
        previous = os.umask(0o027)
        try:
            reference = self.work / 'reference.dmm'
            path = self.destination(existing=False)
            legacy_to_file(fixture(), reference)
            fixture().to_file(path)
        finally:
            os.umask(previous)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), stat.S_IMODE(reference.stat().st_mode))

    @unittest.skipUnless(os.name == 'posix' and hasattr(os, 'geteuid') and os.geteuid() != 0,
                         'Requires an unprivileged POSIX process')
    def test_read_only_target_still_rejected_without_truncation(self):
        path = self.destination()
        path.chmod(0o444)
        try:
            with self.assertRaises(PermissionError):
                fixture().to_file(path)
            self.assertEqual(path.read_bytes(), ORIGINAL)
        finally:
            path.chmod(0o600)

    @unittest.skipUnless(os.name == 'posix' and hasattr(os, 'geteuid') and os.geteuid() != 0,
                         'Requires an unprivileged POSIX process')
    def test_parent_directory_does_not_need_read_or_replacement_permission(self):
        parent = self.work / 'parent'
        parent.mkdir()
        self.addCleanup(parent.chmod, 0o700)
        target = parent / 'target.dmm'
        for mode in (0o300, 0o500):
            with self.subTest(parent_mode=oct(mode)):
                parent.chmod(0o700)
                target.write_bytes(ORIGINAL)
                parent.chmod(mode)
                fixture().to_file(target)
                self.assertEqual(target.read_bytes(), fixture().to_bytes())
        parent.chmod(0o700)

    @unittest.skipUnless(hasattr(os, 'setxattr'), 'Extended attributes unavailable')
    def test_existing_extended_attribute_is_unchanged(self):
        path = self.destination()
        try:
            os.setxattr(path, 'user.dmm_integrity_test', b'fixture metadata')
        except OSError as error:
            if error.errno in (errno.ENOTSUP, errno.EOPNOTSUPP):
                self.skipTest('Fixture filesystem does not support user xattrs')
            raise
        fixture().to_file(path)
        self.assertEqual(os.getxattr(path, 'user.dmm_integrity_test'), b'fixture metadata')


if __name__ == '__main__':
    unittest.main()
