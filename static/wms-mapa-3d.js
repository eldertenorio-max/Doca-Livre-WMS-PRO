/**
 * Visualização 3D do layout WMS — Three.js r128 (script global).
 */
(function (global) {
    'use strict';

    var SLOT_W = 0.92;
    var SLOT_H = 0.68;
    var SLOT_D = 0.90;
    var GAP_POS = 0.10;
    var GAP_CAM = 6;
    var MAX_NIV = 5;
    var AISLE_W = 2.8;
    var LEVEL_H = 0.72;
    var UPR_W = 0.065;
    var UPR_D = 0.065;
    var BEAM_H = 0.055;
    var BEAM_FACE = 0.085;
    var SHELF_TH = 0.038;

    var COL_GRAY = 0xc8ccd0;
    var COL_ORANGE = 0xff7700;
    var COL_FLOOR = 0xd8dde2;

    var LEGENDA = [
        { key: 'vazia', label: 'Vazia (pulmão)', color: '#ffffff' },
        { key: 'picking_vazia', label: 'Vazia (picking nív.1)', color: '#e3f2fd' },
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
        camGroups: {},
        camFilter: null,
        _canvas: null,
        _onPointerMove: null,
        _onClick: null,
        _onWindowResize: null
    };

    var CAM_ORDER = [11, 12, 13, 21];

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

    function _maxNivCam(cod) {
        return parseInt(cod, 10) === 21 ? 2 : MAX_NIV;
    }

    function _camMeta(cod) {
        cod = parseInt(cod, 10);
        if (cod === 21) return { tipo: 'Refrigerado', temp: '-18' };
        return { tipo: 'Congelado', temp: '-20' };
    }

    function _sortCamaras(camaras) {
        return (camaras || []).slice().sort(function (a, b) {
            var ia = CAM_ORDER.indexOf(parseInt(a.codigo, 10));
            var ib = CAM_ORDER.indexOf(parseInt(b.codigo, 10));
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
    }

    function _textPlane(THREE, text, planeW, planeH, fontPx, color, bg) {
        var canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        var ctx = canvas.getContext('2d');
        if (bg) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        ctx.fillStyle = color || '#212121';
        ctx.font = 'bold ' + fontPx + 'px Arial,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(text), canvas.width / 2, canvas.height / 2);
        var tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        var mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        var mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
        return mesh;
    }

    function _addCorridorSignage(THREE, camGroup, aisleLen, cod) {
        var meta = _camMeta(cod);
        var midZ = aisleLen * 0.42;
        var lblMeta = _textPlane(THREE, 'CÂMARA FRIA', 2.2, 0.35, 52, '#212121');
        lblMeta.position.set(0, 3.8, midZ - 1.2);
        camGroup.add(lblMeta);
        var num = _textPlane(THREE, String(cod), 1.8, 1.4, 160, '#c62828');
        num.position.set(0, 2.5, midZ);
        camGroup.add(num);
        var tipo = _textPlane(THREE, meta.tipo, 0.35, 1.6, 48, '#1565c0');
        tipo.position.set(-0.55, 1.5, midZ + 0.5);
        tipo.rotation.y = Math.PI / 2;
        camGroup.add(tipo);
        if (meta.temp) {
            var temp = _textPlane(THREE, meta.temp, 0.9, 0.45, 72, '#c62828');
            temp.position.set(0, 0.55, midZ + 1.1);
            camGroup.add(temp);
        }
        _addBox(THREE, camGroup, AISLE_W * 0.42, 0.06, 0.28, 0, 0.03, 0.18, new THREE.MeshPhongMaterial({ color: 0xffeb3b }));
    }

    function _applyCamFilter() {
        var filter = state.camFilter;
        Object.keys(state.camGroups).forEach(function (cod) {
            var g = state.camGroups[cod];
            if (g) g.visible = !filter || parseInt(cod, 10) === filter;
        });
        centerCameraOnRack();
        renderFrame();
    }

    function setCamaraFilter(cod) {
        state.camFilter = cod ? parseInt(cod, 10) : null;
        if (!state.rackGroup || !Object.keys(state.camGroups).length) return;
        _applyCamFilter();
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
        if (parseInt(slot.nivel, 10) === 1) return hex('#90caf9');
        return hex('#0d47a1');
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
        state.camGroups = {};
        if (!state.rackGroup) return;
        state.rackGroup.traverse(function (ch) {
            if (ch.geometry) ch.geometry.dispose();
            if (ch.material) {
                if (Array.isArray(ch.material)) ch.material.forEach(function (m) { m.dispose(); });
                else ch.material.dispose();
            }
        });
        while (state.rackGroup.children.length) {
            state.rackGroup.remove(state.rackGroup.children[0]);
        }
        state._rackMats = null;
    }

    function finalizeInstancedMesh(im) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.frustumCulled = false;
        if (typeof im.computeBoundingSphere === 'function') {
            im.computeBoundingSphere();
        }
    }

    function _rackMaterials(THREE) {
        if (state._rackMats) return state._rackMats;
        state._rackMats = {
            gray: new THREE.MeshPhongMaterial({ color: COL_GRAY, shininess: 28, specular: 0x444444 }),
            orange: new THREE.MeshPhongMaterial({ color: COL_ORANGE, shininess: 40, specular: 0x663300 }),
            bracing: new THREE.MeshPhongMaterial({ color: 0xb0b4b8, shininess: 20 })
        };
        return state._rackMats;
    }

    function _slotInstanceMaterial(THREE) {
        var vc = THREE.VertexColors !== undefined ? THREE.VertexColors : true;
        return new THREE.MeshPhongMaterial({
            color: 0xffffff,
            vertexColors: vc,
            shininess: 35,
            specular: 0x222222
        });
    }

    function _rackXs(xBase, towardAisle) {
        if (towardAisle > 0) {
            return { front: xBase + BEAM_FACE * 0.55, back: xBase - BEAM_FACE * 0.55 };
        }
        return { front: xBase - BEAM_FACE * 0.55, back: xBase + BEAM_FACE * 0.55 };
    }

    function _addBox(THREE, parent, w, h, d, x, y, z, mat) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        parent.add(m);
        return m;
    }

    function _addUprightPair(THREE, parent, xF, xB, z, rackH, mats) {
        _addBox(THREE, parent, UPR_W, rackH, UPR_D, xF, rackH / 2, z, mats.gray);
        _addBox(THREE, parent, UPR_W, rackH, UPR_D, xB, rackH / 2, z, mats.gray);
        _addBox(THREE, parent, 0.14, 0.045, 0.14, xF, 0.022, z, mats.orange);
        _addBox(THREE, parent, 0.14, 0.045, 0.14, xB, 0.022, z, mats.orange);
        var midY = rackH * 0.45;
        var dx = xF - xB;
        var len = Math.sqrt(dx * dx + 0.04);
        var brace = _addBox(THREE, parent, len, 0.028, 0.028, (xF + xB) / 2, midY, z, mats.bracing);
        brace.rotation.z = Math.atan2(0.2, dx);
        var brace2 = _addBox(THREE, parent, len, 0.028, 0.028, (xF + xB) / 2, midY + rackH * 0.18, z, mats.bracing);
        brace2.rotation.z = -Math.atan2(0.2, dx);
    }

    function _addBeamRun(THREE, parent, xF, xB, z0, z1, y, mats) {
        var cx = (xF + xB) / 2;
        var cz = (z0 + z1) / 2;
        var w = Math.abs(xF - xB) + UPR_W;
        var d = Math.max(UPR_D, Math.abs(z1 - z0) + UPR_D * 0.5);
        _addBox(THREE, parent, w, BEAM_H, d, cx, y, cz, mats.orange);
    }

    function _colunasRua(slots) {
        var set = {};
        (slots || []).forEach(function (s) {
            var p = parseInt(s.posicao, 10) || 0;
            if (p > 0) set[p] = true;
        });
        return Object.keys(set).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; });
    }

    function _buildIndustrialRackSide(THREE, parent, xBase, towardAisle, rua, ruaSlots, camCod, shelfGeo, dummy, col, maxNiv) {
        if (!ruaSlots.length) return 0;
        maxNiv = maxNiv || MAX_NIV;
        var mats = _rackMaterials(THREE);
        var xs = _rackXs(xBase, towardAisle);
        var xF = xs.front;
        var xB = xs.back;
        var colunas = _colunasRua(ruaSlots);
        var rackH = maxNiv * LEVEL_H + 0.35;
        var bayStep = SLOT_D + GAP_POS;
        var zMarks = [0];
        colunas.forEach(function (p) {
            zMarks.push((p - 1) * bayStep + SLOT_D);
        });
        if (zMarks[zMarks.length - 1] < colunas.length * bayStep) {
            zMarks.push(colunas.length * bayStep + 0.15);
        }
        zMarks.forEach(function (z) {
            _addUprightPair(THREE, parent, xF, xB, z, rackH, mats);
        });
        for (var n = 1; n <= maxNiv; n++) {
            var y = (n - 1) * LEVEL_H + BEAM_H * 0.5;
            for (var i = 0; i < zMarks.length - 1; i++) {
                _addBeamRun(THREE, parent, xF, xB, zMarks[i], zMarks[i + 1], y, mats);
            }
        }
        var topY = maxNiv * LEVEL_H + BEAM_H * 0.5;
        for (var ti = 0; ti < zMarks.length - 1; ti++) {
            _addBeamRun(THREE, parent, xF, xB, zMarks[ti], zMarks[ti + 1], topY, mats);
        }

        var mat = _slotInstanceMaterial(THREE);
        var im = new THREE.InstancedMesh(shelfGeo, mat, ruaSlots.length);
        if (THREE.DynamicDrawUsage) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ruaSlots.length * 3), 3);
        im.userData = { isRack: true, camara: camCod, rua: rua };

        ruaSlots.forEach(function (slot, i) {
            var pos = parseInt(slot.posicao, 10) || 1;
            var niv = parseInt(slot.nivel, 10) || 1;
            var z = (pos - 1) * bayStep + SLOT_D / 2;
            var y = (niv - 1) * LEVEL_H + BEAM_H + SHELF_TH * 0.55;
            var cx = (xF + xB) / 2;
            dummy.position.set(cx, y, z);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            im.setMatrixAt(i, dummy.matrix);
            col.setHex(slotColor(slot));
            im.setColorAt(i, col);
            state.slotIndex.push({ mesh: im, instanceId: i, slot: slot, camara: camCod });
        });
        finalizeInstancedMesh(im);
        parent.add(im);
        state.pickables.push(im);
        return zMarks[zMarks.length - 1] + 0.2;
    }

    function _ruaSlots(cam, rua) {
        return (cam.slots || []).filter(function (s) {
            return String(s.rua || '').toUpperCase() === String(rua || '').toUpperCase();
        });
    }

    function _camMaxPosNiv(slots) {
        var maxPos = 1;
        var maxNiv = 1;
        (slots || []).forEach(function (s) {
            var p = parseInt(s.posicao, 10) || 1;
            var n = parseInt(s.nivel, 10) || 1;
            if (p > maxPos) maxPos = p;
            if (n > maxNiv) maxNiv = n;
        });
        return { maxPos: maxPos, maxNiv: maxNiv };
    }

    function _filterSlotsNiv(slots, maxNiv) {
        maxNiv = maxNiv || MAX_NIV;
        return (slots || []).filter(function (s) {
            var n = parseInt(s.nivel, 10) || 1;
            return n >= 1 && n <= maxNiv;
        });
    }

    function _filterSlots15(slots) {
        return _filterSlotsNiv(slots, MAX_NIV);
    }

    function _rackXBase(ruaIndex, totalRuas) {
        if (totalRuas <= 1) return -(AISLE_W / 2 + BEAM_FACE * 0.65);
        return ruaIndex === 0
            ? -(AISLE_W / 2 + BEAM_FACE * 0.65)
            : (AISLE_W / 2 + BEAM_FACE * 0.65);
    }

    function buildOneCamara(THREE, cam, camOffsetX, shelfGeo, dummy, col) {
        var ruas = cam.ruas || [];
        var cod = parseInt(cam.codigo, 10);
        var maxNiv = _maxNivCam(cod);
        var slots = _filterSlotsNiv(cam.slots, maxNiv);
        if (!slots.length) return camOffsetX;

        var camGroup = new THREE.Group();
        camGroup.name = 'camara-' + cod;
        var aisleLen = 0;

        ruas.forEach(function (rua, ri) {
            var ruaSlots = _ruaSlots(cam, rua).filter(function (s) {
                var n = parseInt(s.nivel, 10) || 1;
                return n >= 1 && n <= maxNiv;
            });
            if (!ruaSlots.length) return;
            var xBase = _rackXBase(ri, ruas.length);
            var towardAisle = ri === 0 ? 1 : -1;
            if (ruas.length <= 1) towardAisle = 1;
            var ruaGroup = new THREE.Group();
            ruaGroup.name = 'rua-' + rua;
            var len = _buildIndustrialRackSide(THREE, ruaGroup, xBase, towardAisle, rua, ruaSlots, cod, shelfGeo, dummy, col, maxNiv);
            if (len > aisleLen) aisleLen = len;
            camGroup.add(ruaGroup);
        });

        if (aisleLen < 1) return camOffsetX;
        aisleLen += 0.5;

        var aisleGeo = new THREE.PlaneGeometry(AISLE_W, aisleLen);
        var aisleMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 10, side: THREE.DoubleSide });
        var aisle = new THREE.Mesh(aisleGeo, aisleMat);
        aisle.rotation.x = -Math.PI / 2;
        aisle.position.set(0, -0.02, aisleLen / 2);
        camGroup.add(aisle);

        _addCorridorSignage(THREE, camGroup, aisleLen, cod);

        var floorW = AISLE_W + BEAM_FACE * 2.8;
        var floorGeo = new THREE.PlaneGeometry(floorW, aisleLen + 0.8);
        var floorMat = new THREE.MeshPhongMaterial({ color: COL_FLOOR, shininess: 5, side: THREE.DoubleSide });
        var floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, -0.04, aisleLen / 2);
        camGroup.add(floor);

        var totalW = floorW + 1.4;
        camGroup.position.set(camOffsetX + totalW / 2, 0, 0);
        state.rackGroup.add(camGroup);
        state.camGroups[String(cod)] = camGroup;
        return camOffsetX + totalW + GAP_CAM;
    }

    function buildRack(data) {
        return buildRackAsync(data);
    }

    function buildRackAsync(data) {
        return ensureThree().then(function () {
            var THREE = T();
            clearRack();
            if (!data || !data.camaras || !data.camaras.length || !state.rackGroup) return;

            var pendingFilter = state.camFilter;
            var camaras = _sortCamaras(data.camaras);
            var shelfGeo = new THREE.BoxGeometry(BEAM_FACE * 0.92, SHELF_TH, SLOT_D * 0.88);
            var dummy = new THREE.Object3D();
            var col = new THREE.Color();
            var camOffsetX = 0;
            var idx = 0;

            return new Promise(function (resolve) {
                function next() {
                    if (idx >= camaras.length) {
                        onResize();
                        state.camFilter = pendingFilter;
                        _applyCamFilter();
                        renderFrame();
                        return resolve();
                    }
                    camOffsetX = buildOneCamara(THREE, camaras[idx], camOffsetX, shelfGeo, dummy, col);
                    idx += 1;
                    requestAnimationFrame(next);
                }
                next();
            });
        });
    }

    function centerCameraOnRack() {
        if (!state.rackGroup || !state.camera || !state.controls) return;
        var THREE = T();
        var box = new THREE.Box3();
        var hasVisible = false;
        state.rackGroup.children.forEach(function (ch) {
            if (ch.visible) {
                box.expandByObject(ch);
                hasVisible = true;
            }
        });
        if (!hasVisible) box.setFromObject(state.rackGroup);
        if (box.isEmpty()) return;
        var center = box.getCenter(new THREE.Vector3());
        var size = box.getSize(new THREE.Vector3());
        var maxDim = Math.max(size.x, size.y, size.z, 8);
        state.camera.position.set(center.x, center.y + size.y * 0.65 + 2, center.z - maxDim * 1.15);
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
        state.camGroups = {};
        state.camFilter = null;
        state._rackMats = null;
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
                state.scene.background = new THREE.Color(0xedf0f3);
                state.scene.fog = new THREE.Fog(0xedf0f3, 70, 200);

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

                state.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
                var hemi = new THREE.HemisphereLight(0xffffff, 0xb0bec5, 0.48);
                state.scene.add(hemi);
                var dir = new THREE.DirectionalLight(0xffffff, 0.78);
                dir.position.set(22, 32, 18);
                state.scene.add(dir);
                var fill = new THREE.DirectionalLight(0xffffff, 0.32);
                fill.position.set(-16, 18, -12);
                state.scene.add(fill);
                var back = new THREE.DirectionalLight(0xffffff, 0.22);
                back.position.set(0, 12, -24);
                state.scene.add(back);

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
        if (!state.rackGroup) return;
        state.rackGroup.traverse(function (o) {
            if (o.isInstancedMesh && o.material) o.material.wireframe = state.wireframe;
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
        setCamaraFilter: setCamaraFilter,
        setLoading: setLoading,
        onResize: onResize,
        renderFrame: renderFrame,
        getPrefix: function () { return state.prefix; },
        dispose: disposeInternal
    };
    global.__wmsMapa3dReady = true;
})(typeof window !== 'undefined' ? window : globalThis);
