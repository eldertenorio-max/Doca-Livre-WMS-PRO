/**
 * Visualização 3D do layout WMS (câmaras, ruas, colunas, níveis).
 * Depende de Three.js r128 (carregado sob demanda).
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
        { key: 'avaria', label: 'AVARIA', color: '#ab47bc' }
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
        meshes: [],
        hoverMesh: null,
        defaultCamPos: null,
        defaultTarget: null,
        wireframe: false,
        resizeObs: null
    };

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            if (document.querySelector('script[src="' + src + '"]')) {
                resolve();
                return;
            }
            var s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = function () { reject(new Error('Falha ao carregar ' + src)); };
            document.head.appendChild(s);
        });
    }

    function ensureThree() {
        if (global.THREE && global.THREE.OrbitControls) return Promise.resolve();
        return loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')
            .then(function () {
                return loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
            });
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

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function clearRack() {
        if (!state.rackGroup) return;
        state.meshes.forEach(function (m) {
            state.rackGroup.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material) {
                if (Array.isArray(m.material)) m.material.forEach(function (mat) { mat.dispose(); });
                else m.material.dispose();
            }
        });
        state.meshes = [];
        state.hoverMesh = null;
    }

    function buildRack(data) {
        var THREE = global.THREE;
        clearRack();
        if (!data || !data.camaras || !data.camaras.length) return;

        var camOffsetX = 0;
        data.camaras.forEach(function (cam) {
            var ruas = cam.ruas || [];
            var ruaIndex = {};
            ruas.forEach(function (r, i) { ruaIndex[r] = i; });

            var maxPos = 1;
            (cam.slots || []).forEach(function (s) {
                if (s.posicao > maxPos) maxPos = s.posicao;
            });

            var camGroup = new THREE.Group();
            camGroup.name = 'camara-' + cam.codigo;

            var labelCanvas = document.createElement('canvas');
            labelCanvas.width = 256;
            labelCanvas.height = 64;
            var ctx = labelCanvas.getContext('2d');
            ctx.fillStyle = '#263238';
            ctx.font = 'bold 28px Arial';
            ctx.fillText('Câmara ' + cam.codigo, 8, 40);
            var tex = new THREE.CanvasTexture(labelCanvas);
            var spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
            var sprite = new THREE.Sprite(spriteMat);
            sprite.scale.set(6, 1.5, 1);
            sprite.position.set((maxPos * (SLOT_W + GAP_POS)) / 2, 0.2, -2.5);
            camGroup.add(sprite);

            (cam.slots || []).forEach(function (slot) {
                var ri = ruaIndex[slot.rua] != null ? ruaIndex[slot.rua] : 0;
                var x = (slot.posicao - 1) * (SLOT_W + GAP_POS);
                var y = (slot.nivel - 1) * SLOT_H;
                var z = ri * (SLOT_D + GAP_RUA);

                var geo = new THREE.BoxGeometry(SLOT_W, SLOT_H * 0.92, SLOT_D);
                var col = slotColor(slot);
                var mat = new THREE.MeshLambertMaterial({
                    color: col,
                    wireframe: state.wireframe,
                    transparent: (slot.status !== 'ocupada' && !slot.destino_acao),
                    opacity: (slot.status !== 'ocupada' && !slot.destino_acao) ? 0.88 : 1
                });
                var mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(x + SLOT_W / 2, y + SLOT_H * 0.46, z + SLOT_D / 2);
                mesh.userData = { slot: slot, camara: cam.codigo };
                camGroup.add(mesh);
                state.meshes.push(mesh);

                var edges = new THREE.EdgesGeometry(geo);
                var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x37474f, transparent: true, opacity: 0.35 }));
                line.position.copy(mesh.position);
                camGroup.add(line);
                state.meshes.push(line);
            });

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
        var w = wrap.clientWidth;
        var h = wrap.clientHeight;
        if (w < 10 || h < 10) return;
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

    function onPointerMove(ev) {
        var wrap = document.getElementById('wms-mapa3d-wrap');
        var tip = document.getElementById('wms-mapa3d-tooltip');
        if (!wrap || !state.raycaster || !state.camera) return;
        var rect = wrap.getBoundingClientRect();
        state.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        state.mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.mouse, state.camera);
        var hits = state.raycaster.intersectObjects(state.meshes.filter(function (m) { return m.userData && m.userData.slot; }), false);
        if (hits.length) {
            var mesh = hits[0].object;
            var slot = mesh.userData.slot;
            if (tip) {
                tip.hidden = false;
                tip.style.left = (ev.clientX - rect.left + 12) + 'px';
                tip.style.top = (ev.clientY - rect.top + 12) + 'px';
                var zona = parseInt(slot.nivel, 10) === 1 ? 'PICKING' : 'PULMÃO';
                var extra = slot.destino_label ? (' · ' + slot.destino_label) : (slot.categoria_zona ? (' · Cat ' + slot.categoria_zona) : '');
                tip.innerHTML = '<strong>' + escapeHtml(slot.codigo_endereco) + '</strong><br>'
                    + 'Câm. ' + mesh.userData.camara + ' · Rua ' + escapeHtml(slot.rua)
                    + ' · Pos ' + slot.posicao + ' · Nív ' + slot.nivel + '<br>'
                    + escapeHtml(zona) + ' · ' + escapeHtml(slot.status) + escapeHtml(extra);
            }
            if (state.hoverMesh !== mesh) {
                if (state.hoverMesh && state.hoverMesh.material && state.hoverMesh.material.emissive) {
                    state.hoverMesh.material.emissive.setHex(0x000000);
                }
                state.hoverMesh = mesh;
                if (mesh.material && mesh.material.emissive) {
                    mesh.material.emissive.setHex(0x333333);
                }
            }
            wrap.style.cursor = 'pointer';
        } else {
            if (tip) tip.hidden = true;
            if (state.hoverMesh && state.hoverMesh.material && state.hoverMesh.material.emissive) {
                state.hoverMesh.material.emissive.setHex(0x000000);
            }
            state.hoverMesh = null;
            wrap.style.cursor = 'grab';
        }
    }

    function onClick(ev) {
        var wrap = document.getElementById('wms-mapa3d-wrap');
        var det = document.getElementById('wms-mapa3d-detalhe');
        if (!wrap || !state.raycaster || !det) return;
        var rect = wrap.getBoundingClientRect();
        state.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        state.mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.mouse, state.camera);
        var hits = state.raycaster.intersectObjects(state.meshes.filter(function (m) { return m.userData && m.userData.slot; }), false);
        if (!hits.length) {
            det.hidden = true;
            return;
        }
        var slot = hits[0].object.userData.slot;
        var cam = hits[0].object.userData.camara;
        det.hidden = false;
        det.innerHTML = '<strong>' + escapeHtml(slot.codigo_endereco) + '</strong>'
            + 'Câmara <strong>' + cam + '</strong> · Rua <strong>' + escapeHtml(slot.rua) + '</strong>'
            + ' · Coluna <strong>' + slot.posicao + '</strong> · Nível <strong>' + slot.nivel + '</strong><br>'
            + 'Status: <strong>' + escapeHtml(slot.status) + '</strong>'
            + (slot.categoria_zona ? (' · Categoria zona: <strong>' + escapeHtml(slot.categoria_zona) + '</strong>') : '')
            + (slot.destino_label ? (' · Destino: <strong>' + escapeHtml(slot.destino_label) + '</strong>') : '')
            + (slot.zona_armazenagem ? (' · Zona: ' + escapeHtml(slot.zona_armazenagem.toUpperCase())) : '');
    }

    function setLoading(on) {
        var el = document.getElementById('wms-mapa3d-loading');
        if (el) el.hidden = !on;
    }

    function initScene() {
        if (state.inited) return Promise.resolve();
        return ensureThree().then(function () {
            var THREE = global.THREE;
            var canvas = document.getElementById('wms-mapa3d-canvas');
            var wrap = document.getElementById('wms-mapa3d-wrap');
            if (!canvas || !wrap) return;

            state.scene = new THREE.Scene();
            state.scene.background = new THREE.Color(0xeceff1);
            state.scene.fog = new THREE.Fog(0xeceff1, 40, 120);

            var w = wrap.clientWidth || 800;
            var h = wrap.clientHeight || 480;
            state.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 300);
            state.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
            state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            state.renderer.setSize(w, h, false);

            state.controls = new THREE.OrbitControls(state.camera, canvas);
            state.controls.enableDamping = true;
            state.controls.dampingFactor = 0.08;
            state.controls.maxPolarAngle = Math.PI / 2.05;

            var amb = new THREE.AmbientLight(0xffffff, 0.65);
            state.scene.add(amb);
            var dir = new THREE.DirectionalLight(0xffffff, 0.75);
            dir.position.set(12, 24, 16);
            state.scene.add(dir);
            var dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
            dir2.position.set(-10, 8, -8);
            state.scene.add(dir2);

            state.rackGroup = new THREE.Group();
            state.scene.add(state.rackGroup);

            state.raycaster = new THREE.Raycaster();
            state.mouse = new THREE.Vector2();

            canvas.addEventListener('pointermove', onPointerMove);
            canvas.addEventListener('click', onClick);

            if (typeof ResizeObserver !== 'undefined') {
                state.resizeObs = new ResizeObserver(onResize);
                state.resizeObs.observe(wrap);
            } else {
                window.addEventListener('resize', onResize);
            }

            renderLegenda();
            state.inited = true;
            animate();
        });
    }

    function setWireframe(on) {
        state.wireframe = !!on;
        state.meshes.forEach(function (m) {
            if (m.material && m.material.wireframe !== undefined) {
                m.material.wireframe = state.wireframe;
            }
        });
    }

    function resetView() {
        if (!state.camera || !state.controls || !state.defaultCamPos || !state.defaultTarget) {
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
        dispose: function () {
            if (state.animId) cancelAnimationFrame(state.animId);
            clearRack();
            if (state.renderer) state.renderer.dispose();
            state.inited = false;
        }
    };
})(window);
