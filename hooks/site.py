"""Build hooks of the site.

on_config records the commit of each product repository that the pages
were written from, for the foot of the list pane. on_page_content moves the
first title of a page into the pane header and the Sources section into the
details pane, as DESIGN.md, section 3, describes.
"""

import os
import re
import subprocess

REPOS = [
    ("kernel", "featherweight-kernel", "KERNEL_DIR"),
    ("workbench", "featherweight-workbench", "WORKBENCH_DIR"),
    ("bossmode", "featherweight-bossmode", "BOSSMODE_DIR"),
]

H1 = re.compile(r"<h1[^>]*>(.*?)</h1>\s*", re.S)
SOURCES = re.compile(r'<h2 id="sources">.*?</h2>(.*?)(?=<h2[ >]|\Z)', re.S)
PERMALINK = re.compile(r'<a class="headerlink"[^>]*>.*?</a>', re.S)


def _git(path, *args):
    try:
        out = subprocess.run(
            ["git", "-C", path, *args],
            capture_output=True, text=True, timeout=5, check=True,
        )
        return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def on_config(config, **kwargs):
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    built = []
    for name, repo, env in REPOS:
        path = os.environ.get(env) or os.path.join(here, "..", repo)
        commit = _git(path, "rev-parse", "--short", "HEAD")
        if not commit:
            continue
        built.append({
            "name": name,
            "commit": commit,
            "subject": _git(path, "log", "-1", "--format=%s"),
            "url": f"https://github.com/bdubs00/{repo}/commit/{commit}",
        })
    config.extra["built_from"] = built
    return config


def on_page_content(html, page, config, files, **kwargs):
    m = H1.search(html)
    if m and html[: m.start()].strip() == "":
        page.meta["h1"] = PERMALINK.sub("", m.group(1)).strip()
        html = html[: m.start()] + html[m.end():]
    s = SOURCES.search(html)
    if s:
        body = s.group(1).strip()
        page.meta["sources_html"] = body
        page.meta["sources_count"] = body.count("<li")
        html = html[: s.start()] + html[s.end():]
    return html
