/**
 * Visualização 3D do layout WMS — Three.js r128 + InstancedMesh.
 */
(function (global) {
    'use strict';

    var SLOT_W = 1.15;
    var SLOT_H = 0.85;
    var SLOT_D = 1.05;
    var GAP_POS = 0.12;
    var GAP_RUA = 2.4;
    var GAP_CAM = 22;

    var LEGENDA = [
        { key: 'vazia', label: 'Vazia (pulmão)', color: '#a5d6a7' },
        { key: 'picking_vazia', label: 'Vazia (picking nív.1)', color: '#c8e6c9' },
        { key: 'ocupada', label: 'Ocupada', color: '#ef5350' },
        { key: 'envio_mg', label: 'ENVIO P/ MINAS', color: '#42a5f5' },
        { key: 'retrabalho', label: 'RETRABALHO', color: '#ffca28' },
        { key: 'descarte_perdas', label: 'DESCARTE', color: '#8d6e63' },
        { key: 'palete_bloqueado', label: 'BLOQUEADOS', color: '#78909c' },
        { key: 'avaria', label: 'AVARIA', color: '#ab47bc' },
        { key: 'reentregas', label: 'REENTREGAS', color: '#7e57c2' }
    ];

    var state = {
        inited: false,
        scene: null,
        camera: null,
        renderer: null,
        controls: null,
        rackGroup: null,
        animId: null,
        raycaster: null,
        mouse: null,
        pickables: [],
        hoverMesh: null,
        defaultCamPos: null,
        defaultTarget: null,
        wireframe: false,
        resizeObs: null,
        slotIndex: []
    };

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function waitFor(testFn, maxMs) {
        maxMs = maxMs || 12000;
        return new Promise(function (resolve, reject) {
            var t0 = Date.now();
            (function tick() {
                try {
                    if (testFn()) return resolve();
                } catch (e) { /* ignore */ }
                if (Date.now() - t0 > maxMs) return reject(new Error('Timeout ao carregar biblioteca 3D'));
                setTimeout(tick, 40);
            })();
        });
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var sel = 'script[data-src="' + src + '"]';
            var existing = document.querySelector(sel);
            if (existing) {
                if (existing.dataset.loadError) return reject(new Error('Falha ao carregar ' + src));
                return resolve();
            }
            var s = document.createElement('script');
            s.src = src;
            s.dataset.src = src;
            s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () {
                s.dataset.loadError = '1';
                reject(new Error('Falha ao carregar ' + src));
            };
            document.head.appendChild(s);
        });
    }

    function ensureThree() {
        if (global.THREE && global.THREE.OrbitControls) return Promise.resolve();
        var threeUrl = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
        var ctrlUrl = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
        return loadScript(threeUrl)
            .then(function () { return waitFor(function () { return !!global.THREE; }); })
            .then(function () { return loadScript(ctrlUrl); })
            .then(function () { return waitFor(function () { return !!(global.THREE && global.THREE.OrbitControls); }); });
    }

    function hex(c) {
        return parseInt(String(c).replace('#', ''), 16);
    }

    function slotColor(slot) {
        var dest = (slot.destino_acao || '').toLowerCase();
        if (dest === 'envio_mg') return hex('#42a5f5');
        if (dest === 'retrabalho') return hex('#ffca28');
        if (dest === 'descarte_perdas') return hex('#8d6e63');
        if (dest === 'palete_bloqueado') return hex('#78909c');
        if (dest === 'avaria') return hex('#ab47bc');
        if (dest === 'reentregas') return hex('#7e57c2');
        if ((slot.status || '') === 'ocupada') {
            var cat = (slot.categoria_zona || '').toUpperCase();
            if (cat === 'A') return hex('#e53935');
            if (cat === 'B') return hex('#fb8c00');
            if (cat === 'C') return hex('#fdd835');
            if (cat === 'D') return hex('#8e24aa');
            return hex('#ef5350');
        }
        return parseInt(slot.nivel, 10) === 1 ? hex('#c8e6c9') : hex('#a5d6a7');
    }

    function renderLegenda() {
        var el = document.getElementById('wms-mapa3d-legenda');
        if (!el) return;
        el.innerHTML = LEGENDA.map(function (it) {
            return '<span class="wms-mapa3d-legenda-item"><span class="wms-mapa3d-legenda-swatch" style="background:' + it.color + ';"></span>'
                + escapeHtml(it.label) + '</span>';
        }).join('');
    }

    function clearRack() {
        state.pickables = [];
        state.slotIndex = [];
        state.hoverMesh = null;
        if (!state.rackGroup) return;
        while (state.rackGroup.children.length) {
            var ch = state.rackGroup.children[0];
            state.rackGroup.remove(ch);
            if (ch.geometry) ch.geometry.dispose();
            if (ch.material) {
                if (Array.isArray(ch.material)) ch.material.forEach(function (m) { m.dispose(); });
                else ch.material.dispose();
            }
        }
    }

    function buildRack(data) {
        var THREE = global.THREE;
        clearRack();
        if (!data || !data.camaras || !data.camaras.length || !state.rackGroup) return;

        var boxGeo = new THREE.BoxGeometry(SLOT_W, SLOT_H * 0.92, SLOT_D);
        var dummy = new THREE.Object3D();
        var col = new THREE.Color();
        var camOffsetX = 0;

        data.camaras.forEach(function (cam) {
            var ruas = cam.ruas || [];
            var ruaIndex = {};
            ruas.forEach(function (r, i) { ruaIndex[r] = i; });

            var slots = cam.slots || [];
            if (!slots.length) return;

            var maxPos = 1;
            slots.forEach(function (s) { if (s.posicao > maxPos) maxPos = s.posicao; });

            var camGroup = new THREE.Group();
            camGroup.name = 'camara-' + cam.codigo;

            var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
            var im = new THREE.InstancedMesh(boxGeo, mat, slots.length);
            if (im.instanceMatrix && im.instanceMatrix.setUsage) {
                im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            }
            im.userData = { isRack: true, camara: cam.codigo };

            slots.forEach(function (slot, i) {
                var ri = ruaIndex[slot.rua] != null ? ruaIndex[slot.rua] : 0;
                var x = (slot.posicao - 1) * (SLOT_W + GAP_POS);
                var y = (slot.nivel - 1) * SLOT_H;
                var z = ri * (SLOT_D + GAP_RUA);
                dummy.position.set(x + SLOT_W / 2, y + SLOT_H * 0.46, z + SLOT_D / 2);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                im.setMatrixAt(i, dummy.matrix);
                col.setHex(slotColor(slot));
                im.setColorAt(i, col);
                state.slotIndex.push({
                    mesh: im,
                    instanceId: i,
                    slot: slot,
                    camara: cam.codigo
                });
            });
            im.instanceColor.needsUpdate = true;
            im.computeBoundingSphere();
            camGroup.add(im);
            state.pickables.push(im);

            var floorW = maxPos * (SLOT_W + GAP_POS) + 2;
            var floorD = ruas.length * (SLOT_D + GAP_RUA) + 2;
            var floorGeo = new THREE.PlaneGeometry(floorW, floorD);
            var floorMat = new THREE.MeshLambertMaterial({ color: 0xb0bec5, side: THREE.DoubleSide });
            var floor = new THREE.Mesh(floorGeo, floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(floorW / 2 - 1, -0.02, floorD / 2 - 1);
            camGroup.add(floor);

            camGroup.position.x = camOffsetX;
            state.rackGroup.add(camGroup);
            camOffsetX += floorW + GAP_CAM;
        });

        onResize();
        centerCameraOnRack();
    }

    function centerCameraOnRack() {
        if (!state.rackGroup || !state.camera || !state.controls) return;
        var THREE = global.THREE;
        var box = new THREE.Box3().setFromObject(state.rackGroup);
        if (box.isEmpty()) return;
        var center = box.getCenter(new THREE.Vector3());
        var size = box.getSize(new THREE.Vector3());
        var maxDim = Math.max(size.x, size.y, size.z, 8);
        var dist = maxDim * 1.35;
        state.camera.position.set(center.x + dist * 0.85, center.y + dist * 0.55, center.z + dist * 0.9);
        state.controls.target.copy(center);
        state.controls.update();
        state.defaultCamPos = state.camera.position.clone();
        state.defaultTarget = center.clone();
    }

    function onResize() {
        var wrap = document.getElementById('wms-mapa3d-wrap');
        var canvas = document.getElementById('wms-mapa3d-canvas');
        if (!wrap || !canvas || !state.renderer || !state.camera) return;
        var w = Math.max(wrap.clientWidth, 320);
        var h = Math.max(wrap.clientHeight, 280);
        state.renderer.setSize(w, h, false);
        state.camera.aspect = w / h;
        state.camera.updateProjectionMatrix();
    }

    function animate() {
        state.animId = requestAnimationFrame(animate);
        if (state.controls) state.controls.update();
        if (state.renderer && state.scene && state.camera) {
            state.renderer.render(state.scene, state.camera);
        }
    }

    function pickInstance(ev) {
        var wrap = document.getElementById('wms-mapa3d-wrap');
        if (!wrap || !state.raycaster || !state.camera || !state.pickables.length) return null;
        var rect = wrap.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        state.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        state.mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.mouse, state.camera);
        var hits = state.raycaster.intersectObjects(state.pickables, false);
        for (var h = 0; h < hits.length; h++) {
            var hit = hits[h];
            if (hit.instanceId == null || hit.instanceId < 0) continue;
            var mesh = hit.object;
            for (var i = 0; i < state.slotIndex.length; i++) {
                var rec = state.slotIndex[i];
                if (rec.mesh === mesh && rec.instanceId === hit.instanceId) {
                    return rec;
                }
            }
        }
        return null;
    }

    function onPointerMove(ev) {
        var wrap = document.getElementById('wms-mapa3d-wrap');
        var tip = document.getElementById('wms-mapa3d-tooltip');
        var rec = pickInstance(ev);
        if (rec) {
            var slot = rec.slot;
            if (tip) {
                tip.hidden = false;
                tip.style.left = (ev.clientX - wrap.getBoundingClientRect().left + 12) + 'px';
                tip.style.top = (ev.clientY - wrap.getBoundingClientRect().top + 12) + 'px';
                var zona = parseInt(slot.nivel, 10) === 1 ? 'PICKING' : 'PULMÃO';
                var extra = slot.destino_label ? (' · ' + slot.destino_label) : (slot.categoria_zona ? (' · Cat ' + slot.categoria_zona) : '');
                tip.innerHTML = '<strong>' + escapeHtml(slot.codigo_endereco) + '</strong><br>'
                    + 'Câm. ' + rec.camara + ' · Rua ' + escapeHtml(slot.rua)
                    + ' · Pos ' + slot.posicao + ' · Nív ' + slot.nivel + '<br>'
                    + escapeHtml(zona) + ' · ' + escapeHtml(slot.status) + escapeHtml(extra);
            }
            wrap.style.cursor = 'pointer';
        } else {
            if (tip) tip.hidden = true;
            if (wrap) wrap.style.cursor = 'grab';
        }
    }

    function onClick(ev) {
        var det = document.getElementById('wms-mapa3d-detalhe');
        var rec = pickInstance(ev);
        if (!rec || !det) {
            if (det) det.hidden = true;
            return;
        }
        var slot = rec.slot;
        det.hidden = false;
        det.innerHTML = '<strong>' + escapeHtml(slot.codigo_endereco) + '</strong>'
            + 'Câmara <strong>' + rec.camara + '</strong> · Rua <strong>' + escapeHtml(slot.rua) + '</strong>'
            + ' · Coluna <strong>' + slot.posicao + '</strong> · Nível <strong>' + slot.nivel + '</strong><br>'
            + 'Status: <strong>' + escapeHtml(slot.status) + '</strong>'
            + (slot.categoria_zona ? (' · Categoria zona: <strong>' + escapeHtml(slot.categoria_zona) + '</strong>') : '')
            + (slot.destino_label ? (' · Destino: <strong>' + escapeHtml(slot.destino_label) + '</strong>') : '')
            + (slot.zona_armazenagem ? (' · Zona: ' + escapeHtml(String(slot.zona_armazenagem).toUpperCase())) : '');
    }

    function setLoading(on, msg) {
        var el = document.getElementById('wms-mapa3d-loading');
        if (!el) return;
        el.hidden = !on;
        if (on && msg) el.textContent = msg;
        else if (!on) el.textContent = 'Carregando mapa 3D…';
    }

    function initScene() {
        if (state.inited) {
            onResize();
            return Promise.resolve();
        }
        return ensureThree().then(function () {
            var THREE = global.THREE;
            var canvas = document.getElementById('wms-mapa3d-canvas');
            var wrap = document.getElementById('wms-mapa3d-wrap');
            if (!canvas || !wrap) throw new Error('Área do mapa 3D não encontrada');

            state.scene = new THREE.Scene();
            state.scene.background = new THREE.Color(0xeceff1);
            state.scene.fog = new THREE.Fog(0xeceff1, 40, 160);

            var w = Math.max(wrap.clientWidth, 320);
            var h = Math.max(wrap.clientHeight, 280);
            state.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 400);
            state.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
            state.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
            state.renderer.setSize(w, h, false);

            state.controls = new THREE.OrbitControls(state.camera, canvas);
            state.controls.enableDamping = true;
            state.controls.dampingFactor = 0.08;
            state.controls.maxPolarAngle = Math.PI / 2.05;

            state.scene.add(new THREE.AmbientLight(0xffffff, 0.72));
            var dir = new THREE.DirectionalLight(0xffffff, 0.8);
            dir.position.set(12, 24, 16);
            state.scene.add(dir);

            state.rackGroup = new THREE.Group();
            state.scene.add(state.rackGroup);

            state.raycaster = new THREE.Raycaster();
            state.mouse = new THREE.Vector2();

            canvas.addEventListener('pointermove', onPointerMove);
            canvas.addEventListener('click', onClick);

            if (typeof ResizeObserver !== 'undefined') {
                state.resizeObs = new ResizeObserver(onResize);
                state.resizeObs.observe(wrap);
            }
            global.addEventListener('resize', onResize);

            renderLegenda();
            state.inited = true;
            animate();
        });
    }

    function setWireframe(on) {
        state.wireframe = !!on;
        if (!state.rackGroup) return;
        state.rackGroup.traverse(function (o) {
            if (o.isInstancedMesh && o.material) o.material.wireframe = state.wireframe;
        });
    }

    function resetView() {
        if (!state.camera || !state.controls) return;
        if (!state.defaultCamPos || !state.defaultTarget) {
            centerCameraOnRack();
            return;
        }
        state.camera.position.copy(state.defaultCamPos);
        state.controls.target.copy(state.defaultTarget);
        state.controls.update();
    }

    global.WmsMapa3d = {
        init: initScene,
        setWireframe: setWireframe,
        resetView: resetView,
        build: buildRack,
        setLoading: setLoading,
        onResize: onResize,
        dispose: function () {
            if (state.animId) cancelAnimationFrame(state.animId);
            clearRack();
            if (state.renderer) state.renderer.dispose();
            state.inited = false;
        }
    };
})(window);
