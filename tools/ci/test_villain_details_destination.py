#!/usr/bin/env python3
"""Source-bound villain Details regression, not a DM/runtime navigation test.

Run: python3 tools/ci/test_villain_details_destination.py

The reviewed VillainChoices procedure is bound byte-for-byte after normalizing
only this one destination token. The Python projection selects its existing
pregame/latejoin templates and substitutes fixture data, not new request inputs.
html.escape is a test-only stand-in: source checks require DM html_encode at
both labels. This does not emulate BYOND REF, html_encode, Topic dispatch,
permissions, browser rendering, or native clicks. Upstream PPooch PR #3013's
missing-handler audit motivated this local adaptation; this is not its hunk.
"""
from dataclasses import dataclass
import hashlib
import html
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
PATH = 'code/controllers/subsystem/villains.dm'
OLD = "class='villain-details' aria-label='[html_encode(J.title)] subclasses' href='?src=[REF(J)];jobsubclassinfo=1'"
NEW = OLD.replace('jobsubclassinfo=1', 'explainjob=1')
REVIEWED_PROC_SHA256 = 'd00c47cc8b31f9e7ccf94d8f19e22e51be3c4b2543508483cd7fd940ed4775cb'


def templates(source):
    start = source.index('/mob/dead/new_player/proc/VillainChoices()')
    end = source.index('// this menu allows', start)
    body = source[start:end]
    normalized = body.replace(NEW, OLD)
    if body.count(OLD) + body.count(NEW) != 1 or hashlib.sha256(normalized.encode()).hexdigest() != REVIEWED_PROC_SHA256:
        raise AssertionError('VillainChoices differs from the reviewed source; review the model')
    def line_with(marker):
        lines = [line for line in body.splitlines() if marker in line]
        if len(lines) != 1:
            raise AssertionError('Expected one source template: ' + marker)
        return lines[0].split('dat += "', 1)[1][:-1]
    return (line_with("class='villain-name'"), line_with('[J.total_positions] [J.total_positions == 1'),
            line_with("data-villain-pref="), line_with("class='villain-details'"))


@dataclass(frozen=True)
class Job:
    title: str
    ref: str
    total: int
    current: int = 0


def row(parts, occupations, key, pregame):
    # Bound to GetJob's associative lookup and the source's !J/!total guard.
    job = occupations.get(key)
    if job is None or not job.total:
        return None
    name, slots, pref, details = parts
    template = name + (slots + pref if pregame else details)
    replacements = {'[REF(J)]': job.ref, '[html_encode(J.title)]': html.escape(job.title, quote=True),
                    '[J.current_positions]': str(job.current), '[J.total_positions]': str(job.total)}
    for expression, value in replacements.items():
        template = template.replace(expression, value)
    return template


def link(markup, css):
    match = re.search(r"<a class='" + css + r"'[^>]* href='([^']*)'", markup)
    if match is None:
        raise AssertionError('Missing link ' + css)
    return match[1]


class VillainDetailsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / PATH).read_text()
        cls.parts = templates(cls.source)
        cls.job = Job('Brigand', '[0x123]', 4, 2)
        cls.jobs = {'Brigand': cls.job}

    def test_details_matches_same_rows_canonical_role_destination(self):
        for job in [self.job, Job('Second role', '[0x456]', 1, 1)]:
            with self.subTest(job=job.title):
                markup = row(self.parts, {job.title: job}, job.title, False)
                self.assertEqual(link(markup, 'villain-name'), '?src=' + job.ref + ';explainjob=1')
                self.assertEqual(link(markup, 'villain-details'), link(markup, 'villain-name'))

    def test_destination_has_existing_topic_handler(self):
        handler = (ROOT / 'code/modules/jobs/job_types/_job.dm').read_text()
        handler = handler.split('/datum/job/Topic(href, list/href_list)\n', 1)[1]
        action = link(row(self.parts, self.jobs, 'Brigand', False), 'villain-details').split(';')[1].split('=')[0]
        self.assertIn('if(href_list["' + action + '"])', handler)
        self.assertNotIn('href_list["jobsubclassinfo"]', handler)

    def test_pregame_keeps_preference_and_capacity_without_details_or_join(self):
        markup = row(self.parts, self.jobs, 'Brigand', True)
        self.assertIn('data-villain-pref=', markup)
        self.assertIn('4 [J.total_positions == 1', markup)
        self.assertNotIn('villain-details', markup)
        self.assertNotIn('SelectedJob=', markup)

    def test_nonpregame_preserves_join_and_current_slot_count(self):
        markup = row(self.parts, self.jobs, 'Brigand', False)
        self.assertIn('>Details</a>', markup)
        self.assertIn("SelectedJob=[url_encode(J.title)]'>Join</a>", markup)
        self.assertIn('2 / 4 filled', markup)
        self.assertNotIn('data-villain-pref=', markup)

    def test_escaped_labels_do_not_supply_destination(self):
        title = "<img src=x>&'\";src=bad;explainjob=0"
        job = Job(title, '[0x789]', 1)
        markup = row(self.parts, {title: job}, title, False)
        self.assertEqual(markup.count(html.escape(title, quote=True)), 3)
        self.assertNotIn('<img', markup)
        self.assertEqual(link(markup, 'villain-details'), '?src=[0x789];explainjob=1')
        self.assertIn("aria-label='[html_encode(J.title)] subclasses'", self.parts[3])
        self.assertIn('>[html_encode(J.title)]</a>', self.parts[0])

    def test_unknown_and_malformed_keys_cannot_supply_destination(self):
        for key in [None, '', 'Unknown', '?src=[0xbad];explainjob=1', "Brigand';evil=1", '../Brigand']:
            with self.subTest(key=key):
                self.assertIsNone(row(self.parts, self.jobs, key, False))
        # This projection has no href/request ingress; it models only existing
        # GLOB.villain_positions -> GetJob -> REF(J) source data flow.
        self.assertIn('for(var/job_title in GLOB.villain_positions)', self.source)
        self.assertIn('var/datum/job/J = SSjob.GetJob(job_title)', self.source)
        lookup = (ROOT / 'code/controllers/subsystem/job.dm').read_text()
        self.assertIn('/datum/controller/subsystem/job/proc/GetJob(rank)\n\tif(!occupations.len)\n\t\tSetupOccupations()\n\treturn name_occupations[rank]\n', lookup)

    def test_missing_and_zero_capacity_roles_stay_hidden(self):
        jobs = {'Unavailable': Job('Unavailable', '[0x999]', 0)}
        for pregame in [True, False]:
            self.assertIsNone(row(self.parts, jobs, 'Unavailable', pregame))
            self.assertIsNone(row(self.parts, jobs, 'Missing', pregame))

    def test_unreviewed_control_flow_or_destination_is_rejected(self):
        for old, new in [('if(!J || !J.total_positions)', 'if(!J)'),
                         ('if(pregame)', 'if(!pregame)'),
                         ('[REF(J)]', '[job_title]'),
                         ('[html_encode(J.title)]', '[J.title]')]:
            with self.subTest(mutation=old):
                with self.assertRaises(AssertionError):
                    templates(self.source.replace(old, new))


if __name__ == '__main__':
    unittest.main(verbosity=2)
