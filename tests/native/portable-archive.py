#!/usr/bin/env python3
"""Archive one verified preview and read back every entry. Never launches it."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import tarfile
import zipfile


def sha256(file):
    digest = hashlib.sha256()
    with open(file, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_name(name):
    value = PurePosixPath(name)
    if not name or "\\" in name or value.is_absolute() or any(part in (".", "..") for part in value.parts):
        raise ValueError(f"Unsafe package entry: {name!r}")
    return name


def collect_package(directory, build):
    directory = Path(directory)
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("Package directory must be an ordinary directory")
    manifest_file = directory / "PACKAGE-MANIFEST.json"
    if manifest_file.is_symlink() or not manifest_file.is_file():
        raise ValueError("Package manifest must be an ordinary file")
    if sha256(manifest_file) != build["manifest"]["sha256"]:
        raise ValueError("Package manifest differs from its build receipt")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    expected = {}
    for item in manifest["files"]:
        name = safe_name(item["path"])
        if name in expected:
            raise ValueError(f"Duplicate package entry: {name}")
        expected[name] = {"bytes": item["bytes"], "sha256": item["sha256"]}
    expected["PACKAGE-MANIFEST.json"] = {"bytes": manifest_file.stat().st_size, "sha256": sha256(manifest_file)}
    actual = {}
    for base, directories, files in os.walk(directory, followlinks=False):
        for name in directories + files:
            target = Path(base) / name
            if target.is_symlink():
                raise ValueError(f"Symbolic link in package: {target.relative_to(directory)}")
        for name in files:
            target = Path(base) / name
            info = target.stat()
            if not stat.S_ISREG(info.st_mode):
                raise ValueError(f"Special file in package: {target}")
            key = safe_name(target.relative_to(directory).as_posix())
            actual[key] = {"bytes": info.st_size, "sha256": sha256(target)}
    if actual != expected:
        raise ValueError("Package bytes or file set changed before archiving")
    return manifest, expected


def archive_package(receipt_file, output):
    receipt = json.loads(Path(receipt_file).read_text(encoding="utf-8"))
    if receipt.get("schema") != 1 or len(receipt.get("packages", [])) != 1:
        raise ValueError("One exact package receipt is required")
    build = receipt["packages"][0]
    directory = Path(build["directory"])
    manifest, expected = collect_package(directory, build)
    if manifest["commit"] != receipt["commit"] or manifest["worktreeDirty"]:
        raise ValueError("Portable delivery requires the same clean source checkpoint")
    if manifest["platform"] not in ("win32", "linux"):
        raise ValueError("This portable gate currently qualifies Windows and Linux only")
    output = Path(output).resolve()
    if output == directory.resolve() or directory.resolve() in output.parents:
        raise ValueError("Archive output must be outside the immutable package directory")
    output.mkdir(parents=True, exist_ok=True)
    extension = ".zip" if manifest["platform"] == "win32" else ".tar.gz"
    archive = output / f'Noxviola-PREVIEW-{manifest["platform"]}-{manifest["arch"]}-{manifest["commit"][:12]}{extension}'
    prefix = directory.name + "/"
    if extension == ".zip":
        with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as destination:
            for name in sorted(expected):
                destination.write(directory / name, prefix + name)
    else:
        with tarfile.open(archive, "x:gz", compresslevel=6) as destination:
            for name in sorted(expected):
                destination.add(directory / name, arcname=prefix + name, recursive=False)

    verified = {}
    if extension == ".zip":
        with zipfile.ZipFile(archive) as source:
            for entry in source.infolist():
                name = safe_name(entry.filename)
                if not name.startswith(prefix) or entry.is_dir() or name in verified:
                    raise ValueError(f"Unexpected portable ZIP entry: {name}")
                with source.open(entry) as content:
                    digest = hashlib.sha256()
                    count = 0
                    for chunk in iter(lambda: content.read(1024 * 1024), b""):
                        count += len(chunk)
                        digest.update(chunk)
                verified[name] = {"bytes": count, "sha256": digest.hexdigest()}
    else:
        with tarfile.open(archive, "r:gz") as source:
            for entry in source:
                name = safe_name(entry.name)
                if not name.startswith(prefix) or not entry.isfile() or name in verified:
                    raise ValueError(f"Unexpected portable tar entry: {name}")
                original = directory / name[len(prefix):]
                if entry.mode != stat.S_IMODE(original.stat().st_mode):
                    raise ValueError(f"Portable Linux file mode differs: {name}")
                with source.extractfile(entry) as content:
                    digest = hashlib.sha256()
                    count = 0
                    for chunk in iter(lambda: content.read(1024 * 1024), b""):
                        count += len(chunk)
                        digest.update(chunk)
                verified[name] = {"bytes": count, "sha256": digest.hexdigest()}
    if verified != {prefix + name: value for name, value in expected.items()}:
        raise ValueError("Portable archive readback does not preserve every package byte")
    result = {
        "schema": 1, "commit": manifest["commit"], "platform": manifest["platform"], "arch": manifest["arch"],
        "archive": str(archive), "bytes": archive.stat().st_size, "sha256": sha256(archive),
        "packageManifestSha256": build["manifest"]["sha256"], "applicationManifestSha256": manifest["applicationManifestSha256"],
        "verifiedFiles": len(verified), "unpackedBytes": sum(value["bytes"] for value in verified.values()),
        "unixModesVerified": extension == ".tar.gz", "entryReadback": verified,
        "qualification": "Exact whole-package archive/readback. Native execution evidence is separate; this does not sign or release-qualify the preview.",
    }
    destination = output / "distribution.json"
    with destination.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")
    print(json.dumps({key: value for key, value in result.items() if key != "entryReadback"}, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--output", required=True)
    arguments = parser.parse_args()
    archive_package(arguments.receipt, arguments.output)
