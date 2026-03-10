import path from 'path';

import alias from '@rollup/plugin-alias';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

import copyAndWatch from './copy-and-watch.mjs';

if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = path.resolve(`node_modules/playcanvas/build/playcanvas${BUILD_TYPE === 'debug' ? '.dbg' : ''}/src/index.js`);

export default {
    input: 'src/opentour/OT_LiveStream/index.ts',
    output: {
        dir: 'dist-opentour',
        format: 'esm',
        sourcemap: true,
        entryFileNames: 'ot-live-stream.js'
    },
    plugins: [
        copyAndWatch({
            targets: [
                { src: 'src/opentour/live.html' }
            ]
        }),
        alias({
            entries: {
                playcanvas: ENGINE_DIR
            }
        }),
        typescript({
            tsconfig: './tsconfig.ot-live-stream.json'
        }),
        resolve(),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};
