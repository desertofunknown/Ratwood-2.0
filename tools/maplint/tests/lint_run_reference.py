"""Frozen pre-optimization Lint.run; provenance is verified by focused tests."""
from tools.maplint.source.dmm import DMM
from tools.maplint.source.error import MaplintError

BASELINE_COMMIT = "18408e4248f567dc0def4245dc8b3f910cf7aed7"
BASELINE_PATH = "tools/maplint/source/lint.py"
BASELINE_FILE_SHA256 = "a8c792f972a429b9dc456b3116c0f59e47be2401cb680c515d2f324e8c92bb5b"
BASELINE_RUN_SHA256 = "5d79ee92019473f045e983f8e03bad03e41768b61b86d35b35516f5c2c7f0654"


def run(self, map_data: DMM) -> list[MaplintError]:
    all_failures: list[MaplintError] = []
    (width, height) = map_data.size()

    for pop, contents in map_data.pops.items():
        for typepath_extra, rules in self.rules.items():
            for content_index, content in enumerate(contents):
                if not typepath_extra.matches_path(content.path):
                    continue

                failures = rules.run(content, contents, content_index)
                if len(failures) == 0:
                    continue

                coordinates = map_data.turfs_for_pop(pop)
                coordinate_texts = []

                for _ in range(3):
                    coordinate = next(coordinates, None)
                    if coordinate is None:
                        break

                    x = coordinate[0] + 1
                    y = height - coordinate[1]
                    z = coordinate[2] + 1

                    coordinate_texts.append(f"({x}, {y}, {z})")

                leftover_coordinates = sum(1 for _ in coordinates)
                if leftover_coordinates > 0:
                    coordinate_texts.append(f"and {leftover_coordinates} more")

                for failure in failures:
                    failure.coordinates = ', '.join(coordinate_texts)
                    failure.help = self.help
                    failure.pop_id = pop
                    all_failures.append(failure)

    return list(set(all_failures))
