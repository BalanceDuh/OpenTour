import path from 'path';

import alias from '@rollup/plugin-alias';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import scss from 'rollup-plugin-scss';
import sass from 'sass';

import copyAndWatch from './copy-and-watch.mjs';

if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = path.resolve(`node_modules/playcanvas/build/playcanvas${BUILD_TYPE === 'debug' ? '.dbg' : ''}/src/index.js`);
const PCUI_DIR = path.resolve('node_modules/@playcanvas/pcui');
const HREF = process.env.BASE_HREF || '';

const outputHeader = () => {
    const BLUE_OUT = '\x1b[34m';
    const BOLD_OUT = '\x1b[1m';
    const REGULAR_OUT = '\x1b[22m';
    const RESET_OUT = '\x1b[0m';

    const title = [
        'Building OpenMesh',
        `type ${BOLD_OUT}${BUILD_TYPE}${REGULAR_OUT}`
    ].map(l => `${BLUE_OUT}${l}`).join('\n');
    console.log(`${BLUE_OUT}${title}${RESET_OUT}\n`);
};

outputHeader();

export default {
    input: {
        openmesh: 'src/openmesh/index.ts',
        'mview-fidelity': 'src/openmesh/mview-fidelity.ts',
        showcase: 'src/openmesh/showcase.ts',
        showcase2: 'src/openmesh/showcase2.ts',
        'cinematic-lite': 'src/openmesh/cinematic-lite.ts',
        'glb-loader': 'src/openmesh/glb-loader.ts',
        'camera-tester': 'src/openmesh/camera-tester.ts'
    },
    output: {
        dir: 'dist-openmesh',
        format: 'esm',
        sourcemap: true,
        entryFileNames: '[name].js'
    },
    plugins: [
        copyAndWatch({
            targets: [
                {
                    src: 'src/openmesh/mview-fidelity.html',
                    transform: (contents) => contents.toString().replace('__BASE_HREF__', HREF)
                },
                {
                    src: 'src/openmesh/index.html',
                    transform: (contents) => contents.toString().replace('__BASE_HREF__', HREF)
                },
                {
                    src: 'src/openmesh/showcase.html',
                    transform: (contents) => contents.toString().replace('__BASE_HREF__', HREF)
                },
                {
                    src: 'src/openmesh/showcase2.html',
                    transform: (contents) => contents.toString().replace('__BASE_HREF__', HREF)
                },
                {
                    src: 'src/openmesh/glb-loader.html',
                    transform: (contents) => contents.toString().replace('__BASE_HREF__', HREF)
                },
                {
                    src: 'src/openmesh/mview-test.html',
                    transform: (contents) => contents.toString().replace('__BASE_HREF__', HREF)
                },
                {
                    src: 'src/openmesh/cinematic-lite.html',
                    transform: (contents) => contents.toString().replace('__BASE_HREF__', HREF)
                },
                {
                    src: 'src/openmesh/camera-tester.html',
                    transform: (contents) => contents.toString().replace('__BASE_HREF__', HREF)
                },
                { src: 'static/env', dest: 'static' },
                { src: 'static/showcase2', dest: 'static' },
                { src: 'static/glb-loader', dest: 'static' }
            ]
        }),
        alias({
            entries: {
                'playcanvas': ENGINE_DIR,
                '@playcanvas/pcui': PCUI_DIR
            }
        }),
        typescript({
            tsconfig: './tsconfig.openmesh.json'
        }),
        resolve(),
        scss({
            sourceMap: true,
            runtime: sass,
            processor: (css) => {
                return postcss([autoprefixer])
                .process(css, { from: undefined })
                .then(result => result.css);
            },
            fileName: 'openmesh.css',
            includePaths: [`${PCUI_DIR}/dist`],
            watch: 'src/openmesh'
        }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};
