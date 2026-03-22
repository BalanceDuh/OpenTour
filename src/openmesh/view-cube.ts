import { Mat4, Vec3 } from 'playcanvas';

const vecx = new Vec3();
const vecy = new Vec3();
const vecz = new Vec3();
const mat4 = new Mat4();

class ViewCube {
    dom: HTMLDivElement;

    private svg: SVGSVGElement;

    private group: SVGGElement;

    private width = 0;

    private height = 0;

    private shapes: Record<string, SVGElement | SVGLineElement>;

    constructor(onAlign: (axis: string) => void) {
        this.dom = document.createElement('div');
        this.dom.id = 'openmesh-view-cube';

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.group = document.createElementNS(this.svg.namespaceURI, 'g') as SVGGElement;
        this.svg.appendChild(this.group);
        this.dom.appendChild(this.svg);

        const circle = (color: string, fill: boolean, text?: string) => {
            const result = document.createElementNS(this.svg.namespaceURI, 'g') as SVGElement;
            const element = document.createElementNS(this.svg.namespaceURI, 'circle') as SVGCircleElement;
            element.setAttribute('fill', fill ? color : '#1c232d');
            element.setAttribute('stroke', color);
            element.setAttribute('stroke-width', '2');
            element.setAttribute('r', '11');
            element.setAttribute('cx', '0');
            element.setAttribute('cy', '0');
            element.setAttribute('pointer-events', 'all');
            result.appendChild(element);
            if (text) {
                const label = document.createElementNS(this.svg.namespaceURI, 'text') as SVGTextElement;
                label.setAttribute('font-size', '10');
                label.setAttribute('font-family', 'Segoe UI, Noto Sans, sans-serif');
                label.setAttribute('font-weight', '700');
                label.setAttribute('text-anchor', 'middle');
                label.setAttribute('alignment-baseline', 'central');
                label.textContent = text;
                result.appendChild(label);
            }
            result.setAttribute('cursor', 'pointer');
            this.group.appendChild(result);
            return result;
        };

        const line = (color: string) => {
            const result = document.createElementNS(this.svg.namespaceURI, 'line') as SVGLineElement;
            result.setAttribute('stroke', color);
            result.setAttribute('stroke-width', '2');
            this.group.appendChild(result);
            return result;
        };

        this.shapes = {
            nx: circle('#f06f5a', false),
            ny: circle('#91db84', false),
            nz: circle('#78a7ff', false),
            xaxis: line('#f06f5a'),
            yaxis: line('#91db84'),
            zaxis: line('#78a7ff'),
            px: circle('#f06f5a', true, 'X'),
            py: circle('#91db84', true, 'Y'),
            pz: circle('#78a7ff', true, 'Z')
        };

        [['px', 'px'], ['py', 'py'], ['pz', 'pz'], ['nx', 'nx'], ['ny', 'ny'], ['nz', 'nz']].forEach(([key, axis]) => {
            this.shapes[key].children[0].addEventListener('pointerdown', (event) => {
                event.stopPropagation();
                onAlign(axis);
            });
        });
    }

    update(cameraMatrix: Mat4) {
        const w = this.dom.clientWidth;
        const h = this.dom.clientHeight;
        if (!w || !h) return;

        if (w !== this.width || h !== this.height) {
            this.svg.setAttribute('width', String(w));
            this.svg.setAttribute('height', String(h));
            this.group.setAttribute('transform', `translate(${w * 0.5}, ${h * 0.5})`);
            this.width = w;
            this.height = h;
        }

        mat4.invert(cameraMatrix);
        mat4.getX(vecx);
        mat4.getY(vecy);
        mat4.getZ(vecz);

        const transform = (group: SVGElement, x: number, y: number) => {
            group.setAttribute('transform', `translate(${x * 40}, ${y * 40})`);
        };
        const x2y2 = (line: SVGLineElement, x: number, y: number) => {
            line.setAttribute('x2', String(x * 40));
            line.setAttribute('y2', String(y * 40));
        };

        transform(this.shapes.px as SVGElement, vecx.x, -vecx.y);
        transform(this.shapes.nx as SVGElement, -vecx.x, vecx.y);
        transform(this.shapes.py as SVGElement, vecy.x, -vecy.y);
        transform(this.shapes.ny as SVGElement, -vecy.x, vecy.y);
        transform(this.shapes.pz as SVGElement, vecz.x, -vecz.y);
        transform(this.shapes.nz as SVGElement, -vecz.x, vecz.y);

        x2y2(this.shapes.xaxis as SVGLineElement, vecx.x, -vecx.y);
        x2y2(this.shapes.yaxis as SVGLineElement, vecy.x, -vecy.y);
        x2y2(this.shapes.zaxis as SVGLineElement, vecz.x, -vecz.y);

        const order = [
            { names: ['xaxis', 'px'], value: vecx.z },
            { names: ['yaxis', 'py'], value: vecy.z },
            { names: ['zaxis', 'pz'], value: vecz.z },
            { names: ['nx'], value: -vecx.z },
            { names: ['ny'], value: -vecy.z },
            { names: ['nz'], value: -vecz.z }
        ].sort((a, b) => a.value - b.value);

        const fragment = document.createDocumentFragment();
        order.forEach((entry) => {
            entry.names.forEach((name) => fragment.appendChild(this.shapes[name]));
        });
        this.group.appendChild(fragment);
    }
}

export { ViewCube };
