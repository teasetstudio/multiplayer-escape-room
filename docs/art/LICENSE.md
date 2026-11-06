# Artwork reuse and provenance

The original artwork produced for this pack and its deterministic image derivatives are dedicated under **CC0 1.0 Universal**, to the extent the repository owner holds applicable rights. Reuse, modification and redistribution, including commercial use, are permitted without an attribution requirement. The dedication text is available at <https://creativecommons.org/publicdomain/zero/1.0/>.

This dedication applies to the new artwork in `apps/client/public/assets/`, generated source paintings in `docs/art/sources/`, and art review composites. It does not relicense the application's existing source code or third-party dependencies. AI-generated output may not be unique; this pack makes no claim of exclusive authorship or exclusive rights over AI output.

The 40 source paintings were generated using the built-in image generation tool in this task. Exact prompts and retained source paths appear in `generation-sources.json`. There are no stock-art downloads or third-party game asset packs. The user's THE OTHER GROUP illustration was inspected for visual direction; neither that file nor its pixels are included in this repository. The new characters are original adventurer designs rather than extracted reference figures.

The retained PNG paintings are the editable raster sources supported by this workflow. No layered PSD, 3D model or rig was provided by the image generator. `scripts/art_pipeline.py` deterministically rebuilds the export pack, state variations, team colors, atlases, Tiled metadata and previews from those paintings.

No font files are distributed. Game text should use the existing system sans-serif stack. Review image captions use the build machine's DejaVu Sans font solely during raster rendering.
