# Dasflow

Dasflow - node-based code editor for visual scripting on daScript.

## Prerequisites

- Git
- Node.js and npm
- daScript compiler

If you don't already have daScript compiler, use [this instruction](https://github.com/GaijinEntertainment/daScript/blob/master/doc/getting_started.md) to build and set up it for your platform

## IDE
- VSCode (recommended)

## Installation

### Building daScript with dasHV submodule

1. Run python script modules.py

Example:
```
C:\daScript> python modules.py --path build --on dasHV
```
2. Check that dasHV is successfully installed
3. Rebuild using the description of the previous paragraph

### Dasflow installation

```sh
git clone --recurse-submodules git@github.com:GaijinEntertainment/dasflow.git
npm install
```

## Running

It's needed to open `package.json` file and run `start` script. After that run `src/main.das` file.

Open browser page http://localhost:3000/ to see your default dasflow graph!
