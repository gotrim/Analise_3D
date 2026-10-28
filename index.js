const canvas = document.getElementById("base");
const context = canvas.getContext("2d");
    const selectForma = document.getElementById("forma");
    const botaoAnimacao = document.getElementById("bntPara");
    const botaoExcluir = document.getElementById("excluirForma");
    const sliderDistancia = document.getElementById("distancia");
    const viewcube = document.getElementById("viewcube");
    const painelCriacao = document.getElementById("painelCriacao");
    const botaoConcluir = document.getElementById("concluirCriacao");
    const chaveFormasLivres = "analise3d-formas-livres";

    function lerFormasSalvas() {
        try {
            const salvas = JSON.parse(localStorage.getItem(chaveFormasLivres) || "{}");
            return Object.fromEntries(Object.entries(salvas).filter(([id, forma]) => (
                id.startsWith("livre-") && forma && typeof forma.nome === "string" &&
                Array.isArray(forma.vertices) && Array.isArray(forma.faces) &&
                forma.vertices.length >= 6 && forma.faces.length >= 5
            )));
        } catch {
            return {};
        }
    }

    const formas = {
        cubo: {
            nome: "Cubo",
            vertices: [
                [-0.72, -0.72, -0.72], [0.72, -0.72, -0.72], [0.72, 0.72, -0.72], [-0.72, 0.72, -0.72],
                [-0.72, -0.72, 0.72], [0.72, -0.72, 0.72], [0.72, 0.72, 0.72], [-0.72, 0.72, 0.72],
            ],
            faces: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
        },
        piramide: {
            nome: "Piramide",
            vertices: [
                [-0.82, -0.62, -0.72], [0.82, -0.62, -0.72], [0.82, -0.62, 0.72], [-0.82, -0.62, 0.72],
                [0, 0.92, 0],
            ],
            faces: [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
        },
        prisma: criarPrismaPentagonal(),
    };

    function criarPrismaPentagonal() {
        const vertices = [];
        const faces = [];
        const lados = 5;

        for (const z of [-0.62, 0.62]) {
            for (let indice = 0; indice < lados; indice++) {
                const angulo = -Math.PI / 2 + indice * (Math.PI * 2 / lados);
                vertices.push([Math.cos(angulo) * 0.78, Math.sin(angulo) * 0.78, z]);
            }
        }

        faces.push([0, 1, 2, 3, 4], [9, 8, 7, 6, 5]);
        for (let indice = 0; indice < lados; indice++) {
            const proximo = (indice + 1) % lados;
            faces.push([indice, proximo, proximo + lados, indice + lados]);
        }

        return { nome: "Prisma pentagonal", vertices, faces };
    }

    Object.assign(formas, lerFormasSalvas());
    for (const [id, forma] of Object.entries(formas)) {
        if (!id.startsWith("livre-")) continue;
        const option = document.createElement("option");
        option.value = id;
        option.textContent = forma.nome;
        selectForma.append(option);
    }

    const estado = {
        anguloX: -0.28,
        anguloY: 0.55,
        distancia: Number(sliderDistancia.value),
        animando: false,
        mostrarArestas: true,
        mostrarFaces: true,
        mostrarVertices: false,
        mostrarEixos: true,
        modoCriacao: false,
    };

    const criacao = {
        pontos: [],
        formaAnterior: selectForma.value,
        animandoAntes: true,
        anguloXAnterior: 0,
        anguloYAnterior: 0,
    };
    let formaSelecionadaAtual = selectForma.value;

    let largura = 0;
    let altura = 0;
    let ultimoTempo = 0;

    function redimensionar() {
        const retangulo = canvas.getBoundingClientRect();
        const escala = window.devicePixelRatio || 1;
        largura = retangulo.width;
        altura = retangulo.height;
        canvas.width = Math.round(largura * escala);
        canvas.height = Math.round(altura * escala);
        context.setTransform(escala, 0, 0, escala, 0, 0);
        desenhar();
    }

    function transformar([x, y, z]) {
        const cY = Math.cos(estado.anguloY);
        const sY = Math.sin(estado.anguloY);
        const cX = Math.cos(estado.anguloX);
        const sX = Math.sin(estado.anguloX);
        const rotacionadoX = x * cY + z * sY;
        const rotacionadoZ = -x * sY + z * cY;

        return {
            x: rotacionadoX,
            y: y * cX - rotacionadoZ * sX,
            z: y * sX + rotacionadoZ * cX + estado.distancia,
        };
    }

    function projetar(ponto) {
        const focal = Math.min(largura, altura) * 0.92;
        return {
            x: largura / 2 + ponto.x / ponto.z * focal,
            y: altura / 2 - ponto.y / ponto.z * focal,
        };
    }

    function desenharEixos() {
        const origem = projetar(transformar([0, 0, 0]));
        const eixos = [
            { nome: "X", fim: [1.05, 0, 0], cor: "#fb8063" },
            { nome: "Y", fim: [0, 1.05, 0], cor: "#6cd6ae" },
            { nome: "Z", fim: [0, 0, 1.05], cor: "#f2c65d" },
        ];

        for (const eixo of eixos) {
            const fim = projetar(transformar(eixo.fim));
            context.beginPath();
            context.moveTo(origem.x, origem.y);
            context.lineTo(fim.x, fim.y);
            context.strokeStyle = eixo.cor;
            context.lineWidth = 1.5;
            context.globalAlpha = 0.8;
            context.stroke();
            context.fillStyle = eixo.cor;
            context.font = "600 12px Trebuchet MS, sans-serif";
            context.fillText(eixo.nome, fim.x + 5, fim.y - 5);
        }
        context.globalAlpha = 1;
    }

    function desenharForma() {
        if (estado.modoCriacao) {
            desenharPreviaCriacao();
            return;
        }

        const forma = formas[selectForma.value];
        const vertices3D = forma.vertices.map(transformar);
        const vertices2D = vertices3D.map(projetar);

        if (estado.mostrarFaces) {
            const facesOrdenadas = forma.faces
                .map((face) => ({
                    indices: face,
                    profundidade: face.reduce((soma, indice) => soma + vertices3D[indice].z, 0) / face.length,
                }))
                .sort((a, b) => b.profundidade - a.profundidade);

            for (const face of facesOrdenadas) {
                context.beginPath();
                face.indices.forEach((indice, posicao) => {
                    const ponto = vertices2D[indice];
                    if (posicao === 0) context.moveTo(ponto.x, ponto.y);
                    else context.lineTo(ponto.x, ponto.y);
                });
                context.closePath();
                context.fillStyle = "rgba(91, 190, 160, 0.19)";
                context.fill();
            }
        }

        if (estado.mostrarArestas) {
            const arestas = new Set();
            for (const face of forma.faces) {
                for (let indice = 0; indice < face.length; indice++) {
                    const a = face[indice];
                    const b = face[(indice + 1) % face.length];
                    arestas.add(a < b ? `${a}-${b}` : `${b}-${a}`);
                }
            }

            context.beginPath();
            for (const aresta of arestas) {
                const [a, b] = aresta.split("-").map(Number);
                context.moveTo(vertices2D[a].x, vertices2D[a].y);
                context.lineTo(vertices2D[b].x, vertices2D[b].y);
            }
            context.strokeStyle = "#a9f2d5";
            context.lineWidth = 1.6;
            context.stroke();
        }

        if (estado.mostrarVertices) {
            for (const ponto of vertices2D) {
                context.beginPath();
                context.arc(ponto.x, ponto.y, 4, 0, Math.PI * 2);
                context.fillStyle = "#f5c966";
                context.fill();
                context.strokeStyle = "#10201d";
                context.lineWidth = 1.5;
                context.stroke();
            }
        }
    }

    function desenharPreviaCriacao() {
        const pontos = criacao.pontos.map((ponto) => projetar(transformar(ponto)));
        if (pontos.length === 0) return;

        context.beginPath();
        context.moveTo(pontos[0].x, pontos[0].y);
        for (let indice = 1; indice < pontos.length; indice++) {
            context.lineTo(pontos[indice].x, pontos[indice].y);
        }
        if (pontos.length >= 3) context.closePath();
        context.fillStyle = "rgba(91, 190, 160, 0.24)";
        if (pontos.length >= 3) context.fill();
        context.strokeStyle = "#a9f2d5";
        context.lineWidth = 2;
        context.stroke();

        for (const ponto of pontos) {
            context.beginPath();
            context.arc(ponto.x, ponto.y, 5, 0, Math.PI * 2);
            context.fillStyle = "#f2c65d";
            context.fill();
        }
    }

    function formatarGraus(angulo) {
        const graus = Math.round(angulo * 180 / Math.PI);
        return `${((graus % 360) + 360) % 360}°`;
    }

    function desenhar() {
        context.clearRect(0, 0, largura, altura);
        if (estado.mostrarEixos) desenharEixos();
        desenharForma();
        viewcube.style.transform = `rotateY(${-estado.anguloY}rad) rotateX(${-estado.anguloX}rad)`;
        document.getElementById("leituraX").textContent = formatarGraus(estado.anguloX);
        document.getElementById("leituraY").textContent = formatarGraus(estado.anguloY);
    }

    function atualizarForma() {
        const forma = formas[selectForma.value];
        document.getElementById("nomeForma").textContent = forma.nome;
        botaoExcluir.hidden = !selectForma.value.startsWith("livre-");
        desenhar();
    }

    function girar(eixo, direcao) {
        const passo = Math.PI / 12 * direcao;
        if (eixo === "x") estado.anguloX += passo;
        else estado.anguloY += passo;
        desenhar();
    }

    function atualizarControleAnimacao() {
        botaoAnimacao.textContent = estado.animando ? "Ⅱ" : "▶";
        botaoAnimacao.setAttribute("aria-label", estado.animando ? "Pausar animacao" : "Retomar animacao");
        botaoAnimacao.title = estado.animando ? "Pausar animacao (Espaco)" : "Retomar animacao (Espaco)";
        document.getElementById("estadoAnimacao").textContent = estado.animando ? "ANIMACAO ATIVA" : "ANIMACAO PAUSADA";
    }

    function alternarAnimacao() {
        estado.animando = !estado.animando;
        atualizarControleAnimacao();
    }

    function atualizarContagemPontos() {
        document.getElementById("contagemPontos").textContent = `${criacao.pontos.length} pontos`;
        botaoConcluir.disabled = criacao.pontos.length < 3;
        document.getElementById("apagarPonto").disabled = criacao.pontos.length === 0;
    }

    function apagarUltimoPonto() {
        if (criacao.pontos.length === 0) return;
        criacao.pontos.pop();
        atualizarContagemPontos();
        desenhar();
    }

    function iniciarCriacao() {
        criacao.formaAnterior = formaSelecionadaAtual;
        criacao.animandoAntes = estado.animando;
        criacao.anguloXAnterior = estado.anguloX;
        criacao.anguloYAnterior = estado.anguloY;
        criacao.pontos = [];
        estado.modoCriacao = true;
        estado.anguloX = 0;
        estado.anguloY = 0;
        if (estado.animando) alternarAnimacao();
        painelCriacao.hidden = false;
        canvas.classList.add("modo-criacao");
        document.getElementById("estadoAnimacao").textContent = "MODO DE CRIACAO";
        document.getElementById("nomeFormaLivre").value = "";
        document.getElementById("espessuraForma").value = "0.7";
        document.getElementById("leituraEspessura").textContent = "0.7";
        atualizarContagemPontos();
        desenhar();
    }

    function encerrarCriacao(idForma) {
        estado.modoCriacao = false;
        criacao.pontos = [];
        estado.anguloX = criacao.anguloXAnterior;
        estado.anguloY = criacao.anguloYAnterior;
        painelCriacao.hidden = true;
        canvas.classList.remove("modo-criacao");

        if (idForma) {
            selectForma.value = idForma;
            formaSelecionadaAtual = idForma;
            atualizarForma();
        } else {
            selectForma.value = criacao.formaAnterior;
            formaSelecionadaAtual = criacao.formaAnterior;
            document.getElementById("nomeForma").textContent = formas[formaSelecionadaAtual].nome;
        }

        if (estado.animando !== criacao.animandoAntes) alternarAnimacao();
        document.getElementById("estadoAnimacao").textContent = estado.animando ? "ANIMACAO ATIVA" : "ANIMACAO PAUSADA";
        desenhar();
    }

    function criarFormaLivre() {
        if (criacao.pontos.length < 3) return;
        const nomeDigitado = document.getElementById("nomeFormaLivre").value.trim();
        const totalSalvas = Object.keys(formas).filter((id) => id.startsWith("livre-")).length;
        const nome = nomeDigitado || `Forma livre ${totalSalvas + 1}`;
        const profundidade = Number(document.getElementById("espessuraForma").value);
        const quantidade = criacao.pontos.length;
        const cX = Math.cos(estado.anguloX);
        const sX = Math.sin(estado.anguloX);
        const cY = Math.cos(estado.anguloY);
        const sY = Math.sin(estado.anguloY);
        const normal = [-cX * sY, sX, cX * cY];
        const vertices = [
            ...criacao.pontos.map(([x, y, z]) => [x - normal[0] * profundidade / 2, y - normal[1] * profundidade / 2, z - normal[2] * profundidade / 2]),
            ...criacao.pontos.map(([x, y, z]) => [x + normal[0] * profundidade / 2, y + normal[1] * profundidade / 2, z + normal[2] * profundidade / 2]),
        ];
        const faces = [];

        for (let indice = 1; indice < quantidade - 1; indice++) {
            faces.push([0, indice, indice + 1]);
            faces.push([quantidade, quantidade + indice + 1, quantidade + indice]);
        }

        for (let indice = 0; indice < quantidade; indice++) {
            const proximo = (indice + 1) % quantidade;
            faces.push([indice, proximo, proximo + quantidade, indice + quantidade]);
        }

        const idForma = `livre-${Date.now()}`;
        formas[idForma] = { nome, vertices, faces };
        const option = document.createElement("option");
        option.value = idForma;
        option.textContent = nome;
        selectForma.append(option);

        let salvo = true;
        try {
            const formasLivres = Object.fromEntries(Object.entries(formas).filter(([id]) => id.startsWith("livre-")));
            localStorage.setItem(chaveFormasLivres, JSON.stringify(formasLivres));
        } catch {
            salvo = false;
        }

        encerrarCriacao(idForma);
        if (!salvo) document.getElementById("estadoAnimacao").textContent = "FORMA DISPONIVEL NESTA SESSAO";
    }

    function excluirFormaSelecionada() {
        const idForma = selectForma.value;
        if (!idForma.startsWith("livre-")) return;
        const forma = formas[idForma];
        if (!window.confirm(`Excluir a forma "${forma.nome}"?`)) return;

        delete formas[idForma];
        const option = Array.from(selectForma.options).find((item) => item.value === idForma);
        if (option) option.remove();
        const formasLivres = Object.fromEntries(Object.entries(formas).filter(([id]) => id.startsWith("livre-")));
        try {
            localStorage.setItem(chaveFormasLivres, JSON.stringify(formasLivres));
        } catch {
            document.getElementById("estadoAnimacao").textContent = "EXCLUSAO SO NESTA SESSAO";
        }

        selectForma.value = "cubo";
        formaSelecionadaAtual = "cubo";
        atualizarForma();
    }

    function redefinir() {
        estado.anguloX = -0.28;
        estado.anguloY = 0.55;
        estado.animando = false;
        sliderDistancia.value = "3.8";
        estado.distancia = 3.8;
        document.getElementById("leituraDistancia").textContent = estado.distancia.toFixed(1);
        atualizarControleAnimacao();
        desenhar();
    }

    function animar(tempo) {
        const delta = ultimoTempo ? Math.min((tempo - ultimoTempo) / 1000, 0.05) : 0;
        ultimoTempo = tempo;
        if (estado.animando) {
            estado.anguloY += delta * 0.55;
            desenhar();
        }
        requestAnimationFrame(animar);
    }

    document.querySelectorAll(".rotacao [data-eixo]").forEach((botao) => {
        botao.addEventListener("click", () => girar(botao.dataset.eixo, Number(botao.dataset.passo)));
    });
    const orientacoesViewCube = {
        frente: [0, 0],
        tras: [0, Math.PI],
        direita: [0, -Math.PI / 2],
        esquerda: [0, Math.PI / 2],
        topo: [Math.PI / 2, 0],
        base: [-Math.PI / 2, 0],
    };
    document.querySelectorAll(".viewcube-face").forEach((botao) => {
        botao.addEventListener("click", () => {
            [estado.anguloX, estado.anguloY] = orientacoesViewCube[botao.dataset.view];
            desenhar();
        });
    });

    document.getElementById("mostrarArestas").addEventListener("change", (evento) => {
        estado.mostrarArestas = evento.target.checked;
        desenhar();
    });
    document.getElementById("mostrarFaces").addEventListener("change", (evento) => {
        estado.mostrarFaces = evento.target.checked;
        desenhar();
    });
    document.getElementById("mostrarVertices").addEventListener("change", (evento) => {
        estado.mostrarVertices = evento.target.checked;
        desenhar();
    });
    document.getElementById("mostrarEixos").addEventListener("change", (evento) => {
        estado.mostrarEixos = evento.target.checked;
        desenhar();
    });

    selectForma.addEventListener("change", () => {
        if (selectForma.value === "criar") {
            iniciarCriacao();
            return;
        }
        formaSelecionadaAtual = selectForma.value;
        atualizarForma();
    });
    botaoExcluir.addEventListener("click", excluirFormaSelecionada);
    canvas.addEventListener("click", (evento) => {
        if (!estado.modoCriacao || criacao.pontos.length >= 40) return;
        const retangulo = canvas.getBoundingClientRect();
        const focal = Math.min(largura, altura) * 0.92;
        const xVista = (evento.clientX - retangulo.left - largura / 2) * estado.distancia / focal;
        const yVista = -(evento.clientY - retangulo.top - altura / 2) * estado.distancia / focal;
        const cX = Math.cos(estado.anguloX);
        const sX = Math.sin(estado.anguloX);
        const cY = Math.cos(estado.anguloY);
        const sY = Math.sin(estado.anguloY);
        const x = cY * xVista + sX * sY * yVista;
        const y = cX * yVista;
        const z = sY * xVista - sX * cY * yVista;
        const primeiro = criacao.pontos[0];
        if (criacao.pontos.length >= 3 && Math.hypot(x - primeiro[0], y - primeiro[1]) < 0.05) {
            criarFormaLivre();
            return;
        }

        const anterior = criacao.pontos[criacao.pontos.length - 1];
        if (anterior && Math.hypot(x - anterior[0], y - anterior[1]) < 0.04) return;
        criacao.pontos.push([x, y, z]);
        atualizarContagemPontos();
        desenhar();
    });
    document.getElementById("cancelarCriacao").addEventListener("click", () => encerrarCriacao(null));
    document.getElementById("apagarPonto").addEventListener("click", apagarUltimoPonto);
    botaoConcluir.addEventListener("click", criarFormaLivre);
    document.getElementById("espessuraForma").addEventListener("input", (evento) => {
        document.getElementById("leituraEspessura").textContent = Number(evento.target.value).toFixed(1);
    });
    botaoAnimacao.addEventListener("click", alternarAnimacao);
    document.getElementById("bntReset").addEventListener("click", redefinir);
    sliderDistancia.addEventListener("input", (evento) => {
        estado.distancia = Number(evento.target.value);
        document.getElementById("leituraDistancia").textContent = estado.distancia.toFixed(1);
        desenhar();
    });

    document.addEventListener("keydown", (evento) => {
        if (estado.modoCriacao) {
            if (evento.key === "Escape") encerrarCriacao(null);
            if (evento.target.matches("input, select, button")) return;
            if (evento.key === "Backspace") {
                evento.preventDefault();
                apagarUltimoPonto();
                return;
            }
        } else if (evento.target.matches("input, select, button")) {
            return;
        }
        if (evento.key === "ArrowUp") girar("x", -1);
        else if (evento.key === "ArrowDown") girar("x", 1);
        else if (evento.key === "ArrowLeft") girar("y", -1);
        else if (evento.key === "ArrowRight") girar("y", 1);
        else if (evento.code === "Space") {
            evento.preventDefault();
            alternarAnimacao();
        } else if (evento.key.toLowerCase() === "r") redefinir();
    });

    document.getElementById("leituraDistancia").textContent = estado.distancia.toFixed(1);
    atualizarControleAnimacao();
    new ResizeObserver(redimensionar).observe(canvas);
    redimensionar();
    requestAnimationFrame(animar);