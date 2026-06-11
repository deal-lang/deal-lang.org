# deal-lang/deal-lang.org

Documentation site, tutorials, and in-browser playground for DEAL.

## Stage: 1 (landing page + vision) → Stage 2 (full docs)

## Architecture

Built with [Astro](https://astro.build/) + [Starlight](https://starlight.astro.build/).

```
deal-lang.org/
├── src/
│   ├── content/
│   │   └── docs/
│   │       ├── getting-started/
│   │       │   ├── installation.md
│   │       │   ├── first-project.md
│   │       │   └── concepts.md
│   │       ├── language/
│   │       │   ├── definitions.md      # .deal syntax guide
│   │       │   ├── compositions.md     # .dealx syntax guide
│   │       │   ├── requirements.md     # needs, reqs, use cases
│   │       │   ├── traceability.md     # satisfaction, verification
│   │       │   ├── imports.md          # module system
│   │       │   └── annotations.md      # @confidence, @assumes, etc.
│   │       ├── tooling/
│   │       │   ├── cli.md              # CLI reference
│   │       │   ├── vscode.md           # VS Code extension
│   │       │   └── simulations.md      # deal simulate + deal_sim SDK
│   │       ├── spec/
│   │       │   └── (rendered from spec repo)
│   │       └── blog/
│   │           └── introducing-deal.md
│   └── pages/
│       └── index.astro                 # Landing page
├── playground/
│   └── (WASM-compiled parser — Stage 2)
├── astro.config.mjs
├── package.json
└── README.md
```

## Stage 1 Landing Page Content

1. The pitch — "A text-first language for systems engineering"
2. Architecture diagram (DEAL → IR → multiple backends)
3. Side-by-side: .deal definition vs .dealx composition
4. The EV platform showcase snippets
5. "Why not SysML v2 textual notation?" — the case for DEAL
6. Installation instructions
7. Link to GitHub org

## References Needed

- [ ] Astro + Starlight setup guide
- [ ] WASM compilation of TypeScript parser (for playground)
