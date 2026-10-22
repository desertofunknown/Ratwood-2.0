"""Frozen serializer reference from a529d4ddd (2026-10-22).

The writer bodies below are verbatim from tools/mapmerge2/dmm.py at
BASELINE_COMMIT. The unchanged production key helper/header are shared; no
candidate algorithm is substituted for production in tests or benchmarks.
"""

import hashlib
import inspect

from mapmerge2.dmm import TGM_HEADER, num_to_key

BASELINE_COMMIT = "a529d4ddd18b3b0387829dcace31fad2887603c5"
BASELINE_SOURCE_SHA256 = "ea4e8665ab6e7e1ff0ec45df5bfb9ef97dd36877e70466cbc7e63d63a45d455e"
BASELINE_FUNCTION_SHA256 = {'save_tgm': '1672cb89675a7abd44fad36a32457515fe766fc60b407aa941373cbfb0d544e8', 'save_dmm': '419cb370fce66d8d14c36881d38ec65770441f9daaeeae04422be1fad8011ed2', 'num_to_key': '4be46bebd5f57c96f27826a2d9d8923530f500fe854c7f2e34138780e3de0045', 'max_key_for': '4f720c82fda0187c6dc68cdbaee66cbc8512075026f42529d0cef8ed0929519e'}


def save_tgm(dmm, output):
    output.write(f"{TGM_HEADER}\n")
    if dmm.header:
        output.write(f"{dmm.header}\n")

    # write dictionary in tgm format
    for key, value in sorted(dmm.dictionary.items()):
        output.write(f'"{num_to_key(key, dmm.key_length)}" = (\n')
        for idx, thing in enumerate(value):
            in_quote_block = False
            in_varedit_block = False
            for char in thing:
                if in_quote_block:
                    if char == '"':
                        in_quote_block = False
                    output.write(char)
                elif char == '"':
                    in_quote_block = True
                    output.write(char)
                elif not in_varedit_block:
                    if char == "{":
                        in_varedit_block = True
                        output.write("{\n\t")
                    else:
                        output.write(char)
                elif char == ";":
                    output.write(";\n\t")
                elif char == "}":
                    output.write("\n\t}")
                    in_varedit_block = False
                else:
                    output.write(char)
            if idx < len(value) - 1:
                output.write(",\n")
        output.write(")\n")

    # thanks to YotaXP for finding out about this one
    max_x, max_y, max_z = dmm.size
    for z in range(1, max_z + 1):
        output.write("\n")
        for x in range(1, max_x + 1):
            output.write(f"({x},{1},{z}) = {{\"\n")
            for y in range(max_y, 0, -1):
                output.write(f"{num_to_key(dmm.grid[x, y, z], dmm.key_length)}\n")
            output.write("\"}\n")


def save_dmm(dmm, output):
    if dmm.header:
        output.write(f"{dmm.header}\n")

    # writes a tile dictionary the same way Dreammaker does
    for key, value in sorted(dmm.dictionary.items()):
        output.write(f'"{num_to_key(key, dmm.key_length)}" = ({",".join(value)})\n')

    output.write("\n")

    # writes a map grid the same way Dreammaker does
    max_x, max_y, max_z = dmm.size
    for z in range(1, max_z + 1):
        output.write(f"(1,1,{z}) = {{\"\n")

        for y in range(max_y, 0, -1):
            for x in range(1, max_x + 1):
                try:
                    output.write(num_to_key(dmm.grid[x, y, z], dmm.key_length))
                except KeyError:
                    print(f"Key error: ({x}, {y}, {z})")
            output.write("\n")
        output.write("\"}\n")


def verify_reference():
    """Reject changed reference writers or helper semantics before comparing."""
    from mapmerge2 import dmm
    functions = {
        'save_tgm': save_tgm, 'save_dmm': save_dmm,
        'num_to_key': dmm.num_to_key, 'max_key_for': dmm.max_key_for,
    }
    actual = {name: hashlib.sha256(inspect.getsource(function).rstrip('\n').encode()).hexdigest()
              for name, function in functions.items()}
    if actual != BASELINE_FUNCTION_SHA256:
        raise AssertionError('Frozen serializer reference or key helpers changed')
