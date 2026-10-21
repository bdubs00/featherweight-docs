# The site builds with MkDocs and the Material theme through uv.
# Install uv once: https://docs.astral.sh/uv/getting-started/installation/
MKDOCS = uvx --with-requirements requirements.txt mkdocs

.PHONY: sync build serve clean

sync:            ## copy the design documents of the repositories into docs/design/
	./sync.sh

build: sync      ## build the site into site/
	$(MKDOCS) build --strict

serve: sync      ## serve the site on http://127.0.0.1:8000 and rebuild on change
	$(MKDOCS) serve

clean:
	rm -rf site
