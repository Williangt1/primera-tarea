// Configuración base de la API del docente
const ENDPOINT_ROOT = "https://back-semprivado-umg-h6fkf2bng2avgrgw.westus3-01.azurewebsites.net/api";

// Reglas y Patrones de Validación (Serie I)
const PATTERNS = {
    carne: /^\d{4}-\d{2}-\d{5}$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    pin: /^\d+$/
};

// Estado del cliente
let authenticatedStudent = JSON.parse(localStorage.getItem("umg_student_auth")) || null;
let masterVideoCatalog = [];
let focusedVideoId = null;

// Instancia de Modal de Bootstrap
let viewerModalInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    viewerModalInstance = new bootstrap.Modal(document.getElementById("mediaViewerModal"));
    
    syncNavbarState();
    fetchCategories();
    fetchVideoCatalog();

    // Eventos de filtrado en tiempo real (Serie II)
    document.getElementById("filterKeyword").addEventListener("input", handleSearch);
    document.getElementById("filterSubject").addEventListener("change", handleCategoryChange);
});

// ==========================================
// SERIE I: REGISTRO Y LOGIN
// ==========================================

function syncNavbarState() {
    const zone = document.getElementById("userProfileZone");
    
    if (authenticatedStudent) {
        zone.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                <span class="badge bg-light text-dark border p-2">
                    <i class="bi bi-person-circle text-primary me-1"></i> ${authenticatedStudent.carne}
                </span>
                <button class="btn btn-outline-danger btn-sm" onclick="terminateSession()">Salir</button>
            </div>
        `;
    } else {
        zone.innerHTML = `
            <button class="btn btn-sm btn-outline-primary" data-bs-toggle="modal" data-bs-target="#sessionModal">Ingresar</button>
            <button class="btn btn-sm btn-primary" data-bs-toggle="modal" data-bs-target="#enrollModal">Registrarse</button>
        `;
    }
}

async function processRegister(e) {
    e.preventDefault();
    const carneVal = document.getElementById("newCarne").value.trim();
    const nameVal = document.getElementById("newName").value.trim();
    const emailVal = document.getElementById("newEmail").value.trim();
    const pinVal = document.getElementById("newPin").value.trim();

    // Validaciones de regla de negocio
    if (!PATTERNS.carne.test(carneVal)) {
        return alert("El carné debe cumplir estrictamente con el formato: 9999-99-99999");
    }
    if (!PATTERNS.email.test(emailVal)) {
        return alert("Formato de correo no válido.");
    }
    if (!PATTERNS.pin.test(pinVal)) {
        return alert("El PIN debe ser estrictamente numérico (sin letras ni espacios).");
    }

    try {
        const res = await fetch(`${ENDPOINT_ROOT}/estudiantes/registrar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carne: carneVal,
                estudiante: nameVal,
                correo: emailVal,
                password: pinVal
            })
        });

        if (res.ok) {
            alert("¡Registro completado con éxito! Procede a iniciar sesión.");
            document.getElementById("enrollForm").reset();
            bootstrap.Modal.getInstance(document.getElementById("enrollModal")).hide();
        } else {
            alert("El carné o correo electrónico ya se encuentra registrado.");
        }
    } catch (err) {
        console.error("Error al registrar:", err);
    }
}

async function processLogin(e) {
    e.preventDefault();
    const account = document.getElementById("credentialInput").value.trim();
    const pin = document.getElementById("pinInput").value.trim();

    try {
        const res = await fetch(`${ENDPOINT_ROOT}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usuario: account, password: pin })
        });

        if (res.ok) {
            const resultData = await res.json();
            
            // Garantizar carné para las interacciones posteriores
            let resolvedCarne = resultData.carne || resultData.carnet || (PATTERNS.carne.test(account) ? account : null);

            if (!resolvedCarne) {
                resolvedCarne = prompt("Ingresa tu carné para asociar tus comentarios y likes (ej: 1890-20-11489):");
            }

            authenticatedStudent = {
                carne: resolvedCarne,
                nombre: resultData.estudiante || resultData.nombre || resolvedCarne
            };

            localStorage.setItem("umg_student_auth", JSON.stringify(authenticatedStudent));
            document.getElementById("sessionForm").reset();
            bootstrap.Modal.getInstance(document.getElementById("sessionModal")).hide();
            syncNavbarState();

            if (focusedVideoId) {
                inspectVideoDetails(focusedVideoId);
            }
        } else {
            alert("Credenciales incorrectas.");
        }
    } catch (err) {
        console.error("Error al autenticar:", err);
    }
}

function terminateSession() {
    authenticatedStudent = null;
    localStorage.removeItem("umg_student_auth");
    syncNavbarState();
    if (focusedVideoId) {
        inspectVideoDetails(focusedVideoId);
    }
}

// ==========================================
// SERIE II: CATÁLOGO, FILTRADO Y BÚSQUEDA
// ==========================================

async function fetchVideoCatalog() {
    try {
        const response = await fetch(`${ENDPOINT_ROOT}/videos`);
        masterVideoCatalog = await response.json();
        renderCardDeck(masterVideoCatalog);
    } catch (err) {
        console.error("Fallo al obtener catálogo:", err);
    }
}

async function fetchCategories() {
    try {
        const response = await fetch(`${ENDPOINT_ROOT}/videos/categorias`);
        const catList = await response.json();
        const selectBox = document.getElementById("filterSubject");
        selectBox.innerHTML = `<option value="TODAS">Todas las materias</option>`;

        catList.forEach(item => {
            const catName = typeof item === "string" ? item : (item.nombre || item.categoria);
            selectBox.innerHTML += `<option value="${encodeURIComponent(catName)}">${catName}</option>`;
        });
    } catch (err) {
        console.error("Fallo al obtener categorías:", err);
    }
}

async function handleCategoryChange(evt) {
    const choice = evt.target.value;
    if (choice === "TODAS") {
        renderCardDeck(masterVideoCatalog);
        return;
    }
    try {
        const response = await fetch(`${ENDPOINT_ROOT}/videos/categoria/${choice}`);
        const filtered = await response.json();
        renderCardDeck(filtered);
    } catch (err) {
        console.error("Fallo al filtrar categoría:", err);
    }
}

function handleSearch(evt) {
    const phrase = evt.target.value.toLowerCase().trim();
    const matches = masterVideoCatalog.filter(v => v.titulo && v.titulo.toLowerCase().includes(phrase));
    renderCardDeck(matches);
}

function renderCardDeck(videos) {
    const container = document.getElementById("videoDeck");
    const countBadge = document.getElementById("counterBadge");
    container.innerHTML = "";
    countBadge.innerText = `${videos.length} videos`;

    if (!videos || videos.length === 0) {
        container.innerHTML = `
            <div class="col-12 py-5 text-center text-muted">
                <i class="bi bi-inbox fs-2 d-block mb-2"></i> No se encontraron resultados.
            </div>
        `;
        return;
    }

    videos.forEach(item => {
        const vidId = item.id || item._id;
        const bannerImg = item.poster || "https://placehold.co/400x225/0f172a/ffffff?text=Clase+Virtual";

        container.innerHTML += `
            <div class="col">
                <div class="video-card h-100 d-flex flex-column" role="button" onclick="inspectVideoDetails('${vidId}')">
                    <img src="${bannerImg}" class="video-banner" alt="banner">
                    <div class="p-3 d-flex flex-column justify-content-between flex-grow-1">
                        <div>
                            <span class="badge bg-light text-primary border mb-2">${item.categoria || "General"}</span>
                            <h6 class="fw-bold text-dark mb-1 text-truncate">${item.titulo}</h6>
                            <p class="text-muted small text-truncate mb-2">${item.descripcion || "Sin descripción."}</p>
                        </div>
                        <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                            <span class="small text-muted"><i class="bi bi-clock me-1"></i>${item.duracion || "00:00"}</span>
                            <span class="text-primary small fw-semibold">Ver clase <i class="bi bi-arrow-right"></i></span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

// ==========================================
// SERIE III: DETALLES, LIKES Y COMENTARIOS
// ==========================================

async function inspectVideoDetails(videoId) {
    focusedVideoId = videoId;
    try {
        const res = await fetch(`${ENDPOINT_ROOT}/videos/${videoId}`);
        const info = await res.json();

        document.getElementById("mediaTitleLabel").innerText = info.titulo || "Detalle de Clase";
        document.getElementById("mediaCategoryTag").innerText = info.categoria || "General";
        document.getElementById("mediaTimeTag").innerHTML = `<i class="bi bi-clock me-1"></i>${info.duracion || "--:--"}`;
        document.getElementById("mediaDescriptionText").innerText = info.descripcion || "";

        // Carga de reproductor
        const videoElement = document.getElementById("mediaPlayerElement");
        const playableSource = (info.url && info.url.startsWith("http")) 
            ? info.url 
            : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
        
        videoElement.src = playableSource;
        videoElement.load();

        // Control visual del Me Gusta
        const likeButton = document.getElementById("likeReactionBtn");
        document.getElementById("likesTally").innerText = info.likes || 0;
        
        if (authenticatedStudent && authenticatedStudent.carne) {
            likeButton.disabled = false;
            likeButton.classList.remove("opacity-50");
        } else {
            likeButton.disabled = true;
            likeButton.classList.add("opacity-50");
        }

        renderConversation(info.comentarios || []);
        viewerModalInstance.show();
    } catch (err) {
        console.error("Error al obtener detalle:", err);
    }
}

async function sendVideoLike() {
    if (!authenticatedStudent || !authenticatedStudent.carne) {
        return alert("Acción restringida: Inicia sesión.");
    }

    try {
        const res = await fetch(`${ENDPOINT_ROOT}/interaccionvideo/${focusedVideoId}/like`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ carne: authenticatedStudent.carne })
        });

        if (res.ok) {
            inspectVideoDetails(focusedVideoId);
        } else {
            alert(`Error ${res.status}: No se pudo procesar tu Like.`);
        }
    } catch (err) {
        console.error("Error al dar like:", err);
    }
}

function renderConversation(commentTree) {
    const postBox = document.getElementById("postCommentSection");
    const stream = document.getElementById("conversationStream");

    // Control visual de comentarios para visitantes
    if (authenticatedStudent) {
        postBox.innerHTML = `
            <div class="input-group">
                <input type="text" id="newThreadText" class="form-control" placeholder="Escribe un comentario público...">
                <button class="btn btn-primary" onclick="submitMainComment()">Publicar</button>
            </div>
        `;
    } else {
        postBox.innerHTML = `
            <div class="alert alert-light border small text-muted d-flex justify-content-between align-items-center mb-0">
                <span><i class="bi bi-lock-fill text-secondary me-1"></i> Inicia sesión para interactuar en esta clase.</span>
                <button class="btn btn-sm btn-outline-primary" data-bs-toggle="modal" data-bs-target="#sessionModal">Ingresar</button>
            </div>
        `;
    }

    stream.innerHTML = "";
    if (commentTree.length === 0) {
        stream.innerHTML = `<p class="small text-muted mb-0">No hay aportes aún. ¡Sé el primero!</p>`;
        return;
    }

    commentTree.forEach(node => {
        const nodeId = node.id || node._id;
        const isMine = authenticatedStudent && (authenticatedStudent.carne === node.carne);

        const deleteAction = isMine
            ? `<button class="btn btn-link text-danger p-0 ms-2 text-decoration-none small" onclick="deleteComment('${nodeId}')"><i class="bi bi-trash3"></i></button>`
            : "";

        const replyAction = authenticatedStudent
            ? `<button class="btn btn-link text-primary p-0 text-decoration-none small" onclick="openReplyInput('${nodeId}')">Responder</button>`
            : "";

        stream.innerHTML += `
            <div class="comment-card p-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="fw-bold small text-dark"><i class="bi bi-person me-1"></i>${node.carne}</span>
                    <div>${replyAction} ${deleteAction}</div>
                </div>
                <p class="small text-secondary mb-2">${node.texto}</p>
                <div id="replyArea_${nodeId}"></div>

                <!-- Nivel 1 de Respuestas Anidadas -->
                <div class="subcomment-level mt-2">
                    ${(node.respuestas || []).map(leaf => {
                        const leafId = leaf.id || leaf._id;
                        const isSubMine = authenticatedStudent && (authenticatedStudent.carne === leaf.carne);
                        return `
                            <div class="mb-2">
                                <div class="d-flex justify-content-between align-items-center">
                                    <span class="fw-bold text-muted small">${leaf.carne}</span>${isSubMine ? `<button class="btn btn-link text-danger p-0 text-decoration-none small" onclick="deleteComment('${leafId}')"><i class="bi bi-trash3"></i></button>` : ""}
                                </div>
                                <p class="small text-dark mb-0">${leaf.texto}</p>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    });
}

async function submitMainComment() {
    if (!authenticatedStudent) return;
    const txtField = document.getElementById("newThreadText");
    const content = txtField.value.trim();
    if (!content) return;

    try {
        const res = await fetch(`${ENDPOINT_ROOT}/interaccionvideo/${focusedVideoId}/comentario`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ carne: authenticatedStudent.carne, texto: content })
        });

        if (res.ok) {
            txtField.value = "";
            inspectVideoDetails(focusedVideoId);
        } else {
            alert("No se pudo guardar el comentario.");
        }
    } catch (err) {
        console.error("Error al comentar:", err);
    }
}

function openReplyInput(parentId) {
    const slot = document.getElementById(`replyArea_${parentId}`);
    slot.innerHTML = `
        <div class="input-group input-group-sm mt-2 mb-2">
            <input type="text" id="leafInput_${parentId}" class="form-control" placeholder="Escribe tu respuesta directa...">
            <button class="btn btn-secondary" onclick="submitReply('${parentId}')">Enviar</button>
        </div>
    `;
}

async function submitReply(parentId) {
    if (!authenticatedStudent) return;
    const input = document.getElementById(`leafInput_${parentId}`);
    const textVal = input.value.trim();
    if (!textVal) return;

    try {
        const res = await fetch(`${ENDPOINT_ROOT}/interaccionvideo/comentario/${parentId}/responder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ carne: authenticatedStudent.carne, texto: textVal })
        });

        if (res.ok) {
            inspectVideoDetails(focusedVideoId);
        } else {
            alert("Error al enviar la respuesta.");
        }
    } catch (err) {
        console.error("Error al responder:", err);
    }
}

async function deleteComment(targetId) {
    if (!confirm("¿Deseas eliminar este comentario permanentemente?")) return;

    try {
        const res = await fetch(`${ENDPOINT_ROOT}/interaccionvideo/comentario/${targetId}?carne=${authenticatedStudent.carne}`, {
            method: "DELETE"
        });

        if (res.status === 403) {
            alert("403 Forbidden: No puedes eliminar aportes de otros estudiantes.");
        } else if (res.ok) {
            inspectVideoDetails(focusedVideoId);
        } else {
            alert(`No se pudo eliminar (Status ${res.status}).`);
        }
    } catch (err) {
        console.error("Error al eliminar:", err);
    }
}