# Open THE FARM Noir Dev Container

1. Open this repo in VS Code.
2. Run `Dev Containers: Open Folder in Container...`.
3. Choose `.devcontainer/the-farm-noir/devcontainer.json`.
4. Wait for `postCreateCommand` to finish.
5. In the container terminal, run:

```bash
bash scripts/the-farm/noir/run.sh
```

This executes build, sample generation, verification, and frontend bundle sync for `zk/noir-tier`.
