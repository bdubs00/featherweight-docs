#!/bin/sh
# Copies the design documents of the three repositories into docs/design/.
# Run it before a build. The product repositories stay the source of truth.
# Relative links to source files become GitHub links, and links between the
# documents follow their new names.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
kernel=${KERNEL_DIR:-$here/../featherweight-kernel}
workbench=${WORKBENCH_DIR:-$here/../featherweight-workbench}
out=$here/docs/design
mkdir -p "$out/diagrams"

# copy SRC DST REPO_URL
copy() {
  sed \
    -e "s#](\.\./#](${3}/blob/main/#g" \
    -e 's#](ARCHITECTURE\.md#](kernel-architecture.md#g' \
    -e 's#](KERNEL_MAP\.md#](kernel-map.md#g' \
    -e 's#](ROADMAP\.md#](kernel-roadmap.md#g' \
    -e 's#](PRODUCT_DIRECTION\.md#](product-direction.md#g' \
    "$1" > "$2"
}

copy "$kernel/docs/ARCHITECTURE.md" "$out/kernel-architecture.md" https://github.com/bdubs00/featherweight-kernel
copy "$kernel/docs/KERNEL_MAP.md" "$out/kernel-map.md" https://github.com/bdubs00/featherweight-kernel
copy "$kernel/docs/ROADMAP.md" "$out/kernel-roadmap.md" https://github.com/bdubs00/featherweight-kernel
# The workbench architecture links to its own ARCHITECTURE sections and to the kernel's by path.
sed \
  -e 's#](\.\./#](https://github.com/bdubs00/featherweight-workbench/blob/main/#g' \
  -e 's#](ARCHITECTURE\.md#](workbench-architecture.md#g' \
  -e 's#](PRODUCT_DIRECTION\.md#](product-direction.md#g' \
  "$workbench/docs/ARCHITECTURE.md" > "$out/workbench-architecture.md"
sed \
  -e 's#](\.\./#](https://github.com/bdubs00/featherweight-workbench/blob/main/#g' \
  -e 's#](ARCHITECTURE\.md#](workbench-architecture.md#g' \
  "$workbench/docs/PRODUCT_DIRECTION.md" > "$out/product-direction.md"
cp "$kernel"/docs/diagrams/*.svg "$kernel"/docs/diagrams/*.mmd "$out/diagrams/"
echo "synced design documents into $out"
