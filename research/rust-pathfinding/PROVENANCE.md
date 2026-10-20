# Source and license provenance

Source baseline: desertofunknown/ratwood-engine commit
17a113941a81968bfe58820c1e7fd2791d72a78b.

The experimental replay follows behavior studied in the project's production
code/__HELPERS/AStar.dm and code/__HELPERS/heap.dm. Its real-callback experiment
also inspected code/game/turfs/turf.dm. The owned-data worker and lifecycle
protocol are isolated research code, not production replacements.

Pinned upstream source SHA-256 values:

- AStar.dm: daabfb3609fea12a3b5486ab4b5f9930ee734fefb891069c617e6b802302dd95
- heap.dm: f9e76df25d3638107288a0fe98dd924f3fb930ebad1145775751bedd48fc61d7
- turf.dm: 9b8503c3c0580e9418f2deb756f286ca46018693ad4f1255fa8b211ac5c41946

LICENSE is copied byte-for-byte from the repository root at that commit:
SHA-256 76a97c878c9c7a8321bb395c2b44d3fe2f8d81314d219b20138ed0e2dddd5182.
It is the GNU Affero General Public License, version 3 text. The upstream README
states that code after its referenced 2014 licensing-transition commit is AGPL v3,
with earlier code GPL v3, and describes separate exceptions for other subprojects
and assets. This package includes no game assets or those separate subprojects.
Those upstream provenance and licensing statements are not replaced by this file.
No new SPDX declaration has been invented in the preserved Cargo manifest.

The snapshot replay module was subsequently changed only to add cooperative
control/path-limit hooks, with full serialized-output regression checks against
its preceding isolated results. Worker dispatch adds a replay job variant to the
existing single-thread lifecycle. The source files listed in SOURCE-SHA256.json
are byte-identical to the final tested isolated research source. Documentation
and packaging files were authored for this portable checkpoint.
