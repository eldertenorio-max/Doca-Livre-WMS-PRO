/**
 * Visualização 3D do layout WMS — Three.js r128 (script global).
 */
(function (global) {
    'use strict';

    var SLOT_W = 1.05;
    var SLOT_H = 0.78;
    var SLOT_D = 0.95;
    var GAP_POS = 0.14;
    var GAP_RUA = 3.2;
    var GAP_CAM = 22;
    var FRAME_COLOR = 0xff6f00;
    var _slotGeo = null;

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
        prefix: 'wms-mapa3d',
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
        defaultCamPos: null,
        defaultTarget: null,
        wireframe: false,
        resizeObs: null,
        slotIndex: [],
        _canvas: null,
        _onPointerMove: null,
        _onClick: null,
        _onWindowResize: null
    };

    function T() {
        if (!global.THREE) throw new Error('Three.js não carregou');
        return global.THREE;
    }

    function ensureThree() {
        return new Promise(function (resolve, reject) {
            if (global.THREE && global.THREE.OrbitControls) return resolve();
            var deadline = Date.now() + 20000;
            (function tick() {
                if (global.THREE && global.THREE.OrbitControls) return resolve();
                if (Date.now() > deadline) {
                    return reject(new Error('Three.js não disponível. Verifique a conexão com a internet e recarregue a página.'));
                }
                setTimeout(tick, 50);
            })();
        });
    }

    function $(part) {
        return document.getElementById(state.prefix + '-' + part);
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
        var el = $('legenda');
        if (!el) return;
        el.innerHTML = LEGENDA.map(function (it) {
            return '<span class="wms-mapa3d-legenda-item"><span class="wms-mapa3d-legenda-swatch" style="background:' + it.color + ';"></span>'
                + escapeHtml(it.label) + '</span>';
        }).join('');
    }

    function clearRack() {
        state.pickables = [];
        state.slotIndex = [];
        if (!state.rackGroup) return;
        while (state.rackGroup.children.length) {
            var ch = state.rackGroup.children[0];
            state.rackGroup.remove(ch);
            ch.traverse(function (o) {
                if (o.geometry && o.geometry !== _slotGeo) o.geometry.dispose();
                if (o.material) {
                    if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
                    else o.material.dispose();
                }
            });
        }
    }

    function slotGeometry(THREE) {
        if (!_slotGeo) _slotGeo = new THREE.BoxGeometry(SLOT_W * 0.9, SLOT_H * 0.86, SLOT_D * 0.9);
        return _slotGeo;
    }

    function frameMaterial(THREE) {
        return new THREE.MeshPhongMaterial({ color: FRAME_COLOR, shininess: 20, specular: 0x442200 });
    }

    function slotMaterial(THREE, slot) {
        var c = slotColor(slot);
        var mat = new THREE.MeshPhongMaterial({
            color: c,
            shininess: 45,
            specular: 0x333333
        });
        if ((slot.status || '') === 'ocupada') {
            mat.emissive = new THREE.Color(c);
            mat.emissive.multiplyScalar(0.18);
        }
        return mat;
    }

    function addRuaFrame(THREE, ruaGroup, rackW, rackH, maxNiv) {
        var frameMat = frameMaterial(THREE);
        var back = new THREE.Mesh(new THREE.BoxGeometry(rackW + 0.24, rackH + 0.18, 0.12), frameMat);
        back.position.set(rackW / 2, rackH / 2, -0.08);
        ruaGroup.add(back);
        var top = new THREE.Mesh(new THREE.BoxGeometry(rackW + 0.28, 0.1, SLOT_D + 0.35), frameMat);
        top.position.set(rackW / 2, maxNiv * SLOT_H + 0.04, SLOT_D / 2);
        ruaGroup.add(top);
        var bot = new THREE.Mesh(new THREE.BoxGeometry(rackW + 0.28, 0.1, SLOT_D + 0.35), frameMat);
        bot.position.set(rackW / 2, -0.04, SLOT_D / 2);
        ruaGroup.add(bot);
    }

    function buildOneCamara(THREE, cam, camOffsetX) {
        var ruas = cam.ruas || [];
        var ruaIndex = {};
        ruas.forEach(function (r, i) { ruaIndex[r] = i; });
        var slots = cam.slots || [];
        if (!slots.length) return camOffsetX;

        var maxPos = 1;
        var maxNiv = 1;
        slots.forEach(function (s) {
            var p = parseInt(s.posicao, 10) || 0;
            var n = parseInt(s.nivel, 10) || 1;
            if (p > maxPos) maxPos = p;
            if (n > maxNiv) maxNiv = n;
        });

        var camGroup = new THREE.Group();
        camGroup.name = 'camara-' + cam.codigo;
        var geo = slotGeometry(THREE);

        slots.forEach(function (slot) {
            var ri = ruaIndex[slot.rua] != null ? ruaIndex[slot.rua] : 0;
            var pos = parseInt(slot.posicao, 10) || 1;
            var niv = parseInt(slot.nivel, 10) || 1;
            var x = (pos - 1) * (SLOT_W + GAP_POS);
            var y = (niv - 1) * SLOT_H;
            var z = ri * (SLOT_D + GAP_RUA);
            var mesh = new THREE.Mesh(geo, slotMaterial(THREE, slot));
            mesh.position.set(x + SLOT_W / 2, y + SLOT_H * 0.43, z + SLOT_D / 2);
            mesh.userData = { isSlot: true, slot: slot, camara: cam.codigo };
            camGroup.add(mesh);
            state.pickables.push(mesh);
            state.slotIndex.push({ mesh: mesh, slot: slot, camara: cam.codigo });
        });

        ruas.forEach(function (rua, ri) {
            var ruaSlots = slots.filter(function (s) { return s.rua === rua; });
            if (!ruaSlots.length) return;
            var rMaxPos = 1;
            var rMaxNiv = 1;
            ruaSlots.forEach(function (s) {
                var p = parseInt(s.posicao, 10) || 0;
                var n = parseInt(s.nivel, 10) || 1;
                if (p > rMaxPos) rMaxPos = p;
                if (n > rMaxNiv) rMaxNiv = n;
            });
            var rackW = rMaxPos * (SLOT_W + GAP_POS);
            var rackH = rMaxNiv * SLOT_H;
            var ruaGroup = new THREE.Group();
            ruaGroup.position.z = ri * (SLOT_D + GAP_RUA);
            addRuaFrame(THREE, ruaGroup, rackW, rackH, rMaxNiv);
            var floorGeo = new THREE.PlaneGeometry(rackW + 1.2, SLOT_D + 0.8);
            var floorMat = new THREE.MeshPhongMaterial({ color: 0xcfd8dc, side: THREE.DoubleSide, shininess: 5 });
            var floor = new THREE.Mesh(floorGeo, floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(rackW / 2, -0.03, SLOT_D / 2);
            ruaGroup.add(floor);
            camGroup.add(ruaGroup);
        });

        var floorW = maxPos * (SLOT_W + GAP_POS) + 2;
        var floorD = ruas.length * (SLOT_D + GAP_RUA) + 1.5;
        var baseGeo = new THREE.PlaneGeometry(floorW, floorD);
        var baseMat = new THREE.MeshPhongMaterial({ color: 0xeceff1, side: THREE.DoubleSide });
        var base = new THREE.Mesh(baseGeo, baseMat);
        base.rotation.x = -Math.PI / 2;
        base.position.set(floorW / 2 - 0.5, -0.05, floorD / 2 - 0.8);
        camGroup.add(base);

        camGroup.position.x = camOffsetX;
        state.rackGroup.add(camGroup);
        return camOffsetX + floorW + GAP_CAM;
    }

    function buildRack(data) {
        return buildRackAsync(data);
    }

    function buildRackAsync(data) {
        return ensureThree().then(function () {
            var THREE = T();
            clearRack();
            if (!data || !data.camaras || !data.camaras.length || !state.rackGroup) return;

            var camaras = data.camaras.slice();
            var camOffsetX = 0;
            var idx = 0;

            return new Promise(function (resolve) {
                function next() {
                    if (idx >= camaras.length) {
                        onResize();
                        centerCameraOnRack();
                        renderFrame();
                        return resolve();
                    }
                    camOffsetX = buildOneCamara(THREE, camaras[idx], camOffsetX);
                    idx += 1;
                    if (idx % 2 === 0) requestAnimationFrame(next);
                    else next();
                }
                next();
            });
        });
    }

    function centerCameraOnRack() {
        if (!state.rackGroup || !state.camera || !state.controls) return;
        var THREE = T();
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
        var wrap = $('wrap');
        var canvas = $('canvas');
        if (!wrap || !canvas || !state.renderer || !state.camera) return;
        var rect = wrap.getBoundingClientRect();
        var w = Math.max(rect.width || wrap.clientWidth, 320);
        var h = Math.max(rect.height || wrap.clientHeight, 280);
        state.renderer.setSize(w, h, false);
        state.camera.aspect = w / h;
        state.camera.updateProjectionMatrix();
    }

    function renderFrame() {
        if (state.controls) state.controls.update();
        if (state.renderer && state.scene && state.camera) {
            state.renderer.render(state.scene, state.camera);
        }
    }

    function animate() {
        state.animId = requestAnimationFrame(animate);
        renderFrame();
    }

    function pickInstance(ev) {
        var wrap = $('wrap');
        if (!wrap || !state.raycaster || !state.camera || !state.pickables.length) return null;
        var rect = wrap.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        state.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        state.mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.mouse, state.camera);
        var hits = state.raycaster.intersectObjects(state.pickables, false);
        for (var h = 0; h < hits.length; h++) {
            var mesh = hits[h].object;
            if (mesh && mesh.userData && mesh.userData.isSlot && mesh.userData.slot) {
                return {
                    mesh: mesh,
                    slot: mesh.userData.slot,
                    camara: mesh.userData.camara
                };
            }
        }
        return null;
    }

    function onPointerMove(ev) {
        var wrap = $('wrap');
        var tip = $('tooltip');
        var rec = pickInstance(ev);
        if (rec) {
            var slot = rec.slot;
            if (tip && wrap) {
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
            if (wrap) wrap.style.cursor = 'pointer';
        } else {
            if (tip) tip.hidden = true;
            if (wrap) wrap.style.cursor = 'grab';
        }
    }

    function onClick(ev) {
        var det = $('detalhe');
        var rec = pickInstance(ev);
        if (!rec || !det) {
            if (det) det.hidden = true;
            return;
        }
        var slot = rec.slot;
        det.hidden = false;
        det.innerHTML = '<strong>' + escapeHtml(slot.codigo_endereco) + '</strong>'
            + ' — Câmara <strong>' + rec.camara + '</strong> · Rua <strong>' + escapeHtml(slot.rua) + '</strong>'
            + ' · Coluna <strong>' + slot.posicao + '</strong> · Nível <strong>' + slot.nivel + '</strong><br>'
            + 'Status: <strong>' + escapeHtml(slot.status) + '</strong>'
            + (slot.categoria_zona ? (' · Categoria zona: <strong>' + escapeHtml(slot.categoria_zona) + '</strong>') : '')
            + (slot.destino_label ? (' · Destino: <strong>' + escapeHtml(slot.destino_label) + '</strong>') : '')
            + (slot.zona_armazenagem ? (' · Zona: ' + escapeHtml(String(slot.zona_armazenagem).toUpperCase())) : '');
    }

    function setLoading(on, msg) {
        var el = $('loading');
        if (!el) return;
        el.hidden = !on;
        if (on && msg) el.textContent = msg;
        else if (!on) el.textContent = 'Carregando mapa 3D…';
    }

    function disposeInternal() {
        if (state.animId) {
            cancelAnimationFrame(state.animId);
            state.animId = null;
        }
        if (state._canvas && state._onPointerMove) {
            state._canvas.removeEventListener('pointermove', state._onPointerMove);
            state._canvas.removeEventListener('click', state._onClick);
        }
        if (state.resizeObs) {
            try { state.resizeObs.disconnect(); } catch (e) { /* ignore */ }
            state.resizeObs = null;
        }
        if (state._onWindowResize) {
            global.removeEventListener('resize', state._onWindowResize);
            state._onWindowResize = null;
        }
        if (state.controls) {
            try { state.controls.dispose(); } catch (e) { /* ignore */ }
            state.controls = null;
        }
        clearRack();
        if (state.renderer) {
            try { state.renderer.dispose(); } catch (e) { /* ignore */ }
            state.renderer = null;
        }
        state.scene = null;
        state.camera = null;
        state.rackGroup = null;
        state._canvas = null;
        state.inited = false;
    }

    function waitForLayout(wrap, tries) {
        tries = tries || 0;
        return new Promise(function (resolve, reject) {
            requestAnimationFrame(function () {
                if (!wrap) return reject(new Error('Área do mapa 3D não encontrada'));
                var r = wrap.getBoundingClientRect();
                if (r.width > 40 && r.height > 40) return resolve();
                if (tries >= 40) {
                    return resolve();
                }
                waitForLayout(wrap, tries + 1).then(resolve, reject);
            });
        });
    }

    function initScene(opts) {
        var prefix = (opts && opts.prefix) || state.prefix || 'wms-mapa3d';
        var force = !!(opts && opts.force);
        if (state.inited && (state.prefix !== prefix || force)) {
            disposeInternal();
        }
        state.prefix = prefix;
        if (state.inited) {
            onResize();
            return Promise.resolve();
        }
        return ensureThree().then(function () {
            var THREE = T();
            var canvas = $('canvas');
            var wrap = $('wrap');
            if (!canvas || !wrap) throw new Error('Área do mapa 3D não encontrada (' + state.prefix + ')');

            return waitForLayout(wrap).then(function () {
                state.scene = new THREE.Scene();
                state.scene.background = new THREE.Color(0xeceff1);
                state.scene.fog = new THREE.Fog(0xeceff1, 40, 160);

                var rect = wrap.getBoundingClientRect();
                var w = Math.max(rect.width || wrap.clientWidth, 320);
                var h = Math.max(rect.height || wrap.clientHeight, 280);
                state.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 400);
                state.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
                state.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
                state.renderer.setSize(w, h, false);

                if (!THREE.OrbitControls) throw new Error('OrbitControls não carregou');
                state.controls = new THREE.OrbitControls(state.camera, canvas);
                state.controls.enableDamping = true;
                state.controls.dampingFactor = 0.08;
                state.controls.maxPolarAngle = Math.PI / 2.05;

                state.scene.add(new THREE.HemisphereLight(0xffffff, 0x90a4ae, 0.62));
                state.scene.add(new THREE.AmbientLight(0xffffff, 0.28));
                var dir = new THREE.DirectionalLight(0xffffff, 0.82);
                dir.position.set(18, 28, 14);
                state.scene.add(dir);
                var fill = new THREE.DirectionalLight(0xb3e5fc, 0.35);
                fill.position.set(-12, 14, -10);
                state.scene.add(fill);

                state.rackGroup = new THREE.Group();
                state.scene.add(state.rackGroup);

                state.raycaster = new THREE.Raycaster();
                state.mouse = new THREE.Vector2();

                state._canvas = canvas;
                state._onPointerMove = onPointerMove;
                state._onClick = onClick;
                canvas.addEventListener('pointermove', onPointerMove);
                canvas.addEventListener('click', onClick);

                state._onWindowResize = onResize;
                if (typeof ResizeObserver !== 'undefined') {
                    state.resizeObs = new ResizeObserver(onResize);
                    state.resizeObs.observe(wrap);
                }
                global.addEventListener('resize', state._onWindowResize);

                renderLegenda();
                state.inited = true;
                animate();
                renderFrame();
            });
        });
    }

    function setWireframe(on) {
        state.wireframe = !!on;
        state.pickables.forEach(function (mesh) {
            if (mesh.material) mesh.material.wireframe = state.wireframe;
        });
        renderFrame();
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
        renderFrame();
    }

    global.WmsMapa3d = {
        init: initScene,
        setWireframe: setWireframe,
        resetView: resetView,
        build: buildRack,
        setLoading: setLoading,
        onResize: onResize,
        renderFrame: renderFrame,
        getPrefix: function () { return state.prefix; },
        dispose: disposeInternal
    };
    global.__wmsMapa3dReady = true;
})(typeof window !== 'undefined' ? window : globalThis);
