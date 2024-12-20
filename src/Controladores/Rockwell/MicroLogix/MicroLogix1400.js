import { ServicosPCCC } from "../../../EtherNetIP/Builder/Layers/EtherNetIP/CommandSpecificDatas/SendRRData/CIP/Servicos/CIPPCCC/CIPPCCC.js";
import { EtherNetIPSocket } from "../../../EtherNetIP/EtherNetIP.js";
import { EmissorEvento } from "../../../Utils/EmissorEvento.js";

/**
 * Clase para interactuar con un controlador MicroLogix 1400 de Rockwell
 */
export class MicroLogix1400 {

    /**
     * @type {EtherNetIPSocket} - Socket de comunicação com o dispositivo remoto no protocolo EtherNet/IP
     */
    #ENIPSocket;

    #configuracao = {
        ip: '',
        porta: 0,
        logs: {
            habilitarLogsConsole: false
        }
    }

    #estado = {
        /**
         * Emissor de eventos
         */
        emissorEvento: new EmissorEvento(),
    }

    /**
     * Parametros de conexão com o controlador MicroLogix 1400
     * @param {Object} parametros
     * @param {String} parametros.ip - Endereço IP do controlador
     * @param {Number} parametros.porta - Porta
     * @param {Boolean} parametros.habilitaLogs - Se os logs do gerenciador de EtherNetIP devem ser mostrados no console
     * @param {Boolean} parametros.autoReconectar - Se deve tentar reconectar automaticamente em caso de: 1 - Perda de conexão com o controlador, 2 - Desautenticação com o dispositivo por algum motivo(acho raro acontecer '-')
     */
    constructor(parametros) {
        if (parametros == undefined || typeof parametros != 'object') throw new Error('Parâmetros de conexão não informados');
        if (parametros.ip == undefined) throw new Error('Endereço IP não informado');
        if (parametros.porta == undefined) throw new Error('Porta de comunicação não informada');

        this.#configuracao.ip = parametros.ip;
        this.#configuracao.porta = parametros.porta;

        let isHabLogs = false;

        if (parametros.habilitaLogs) isHabLogs = true;

        this.#configuracao.logs.habilitarLogsConsole = isHabLogs;

        this.#ENIPSocket = new EtherNetIPSocket({
            isHabilitaLogs: false,
            conexao: {
                ip: this.#configuracao.ip,
                porta: this.#configuracao.porta
            },
            isAutoReconnect: parametros.autoReconectar
        });

        this.#ENIPSocket.onLog((msgLog) => {
            this.log(msgLog);
        })
    }

    /**
     * Conectar ao MicroLogix 1400
     */
    async conectar() {

        /**
        * @typedef RetornoConectar
        * @property {Boolean} isConectou - Se a conexão foi bem sucedida
        * @property {Object} erro - Se não conectou, contém os detalhes do motivo
        * @property {String} erro.descricao - Descrição do erro ocorrido
        * @property {Boolean} erro.isSemConexao - Se o erro foi causado por não conseguir conectar ao controlador
        * @property {Boolean} erro.isAutenticar - Se o erro foi causado devido ao erro de tentar estabelecer a conexão com o RegisterSession
        * @property {Boolean} erro.isDispositivoRecusou - Se o erro foi causado devido ao dispositivo recusar a conexão
        */

        /**
         * @type {RetornoConectar}
         */
        const retornoConexao = {
            isConectou: false,
            erro: {
                descricao: '',
                isAutenticar: false,
                isDispositivoRecusou: false,
                isSemConexao: false
            }
        }

        let retornoConectar = await this.#ENIPSocket.conectar();

        // Se o EtherNet/IP não conseguiu se conectar
        if (!retornoConectar.isConectou) {

            if (retornoConectar.erro.isSemConexao) {
                retornoConexao.erro.descricao = 'Sem comunicação com o dispositivo remoto';
                retornoConexao.erro.isSemConexao = true;
            } else if (retornoConectar.erro.isFalhaAutenticar) {
                retornoConexao.erro.descricao = `Falha ao autenticar com o dispositivo remoto: ${retornoConectar.erro.descricao}`;
                retornoConexao.erro.isAutenticar = true;
            } else if (retornoConectar.erro.isDispositivoRecusou) {
                retornoConexao.erro.descricao = 'Dispositivo remoto recusou a conexão';
                retornoConexao.erro.isDispositivoRecusou = true;
            } else {
                retornoConexao.erro.descricao = `Erro ao tentar se conectar: ${retornoConectar.erro.descricao}`;
            }
        }

        retornoConexao.isConectou = true;
        return retornoConexao;
    }

    /**
    * Desconectar o Socket EtherNet/IP. É enviado ao dispositivo a solicitação de UnRegister Session para excluir a sessão da memoria e o Socket TCP é destruido junto.
    ** Mesmo que o comando não seja enviado(por exemplo se esta sem conexão com o dispositivo), o socket é destruido de qualquer forma e é necessario conectar novamente.
    */
    async desconectar() {
        await this.#ENIPSocket.desconectar();
    }

    /**
    * Retorna se a autenticação está estabelecida com o controlador MicroLogix 1400
    ** Se estiver desconectado, isso será false, então da pra usar esse cara pra saber se tá tudo conectado certo ou não
    */
    isAutenticado() {
        return this.#ENIPSocket.getEstadoAutenticacao().isAutenticado;
    }

    /**
     * Retornar o Socket de comunicação com o dispositivo EtherNet/IP
     */
    getENIPSocket() {
        return this.#ENIPSocket;
    }

    /**
     * Adicionar um callback para quando um log for disparado
     * @param {CallbackLog} cb 
     */
    onLog(cb) {
        this.#estado.emissorEvento.addEvento('log', cb);
    }

    /**
     * Enviar uma solicitação de leitura do Status File(Identificação S) e retorna as informações de SO, processador e compilação
     *
     ** Se o valor de alguma informação for undefined, significa que não foi possível obter ela.
     */
    async readVersao() {
        const retornoVersion = {
            /**
             * Se foi possível obter as informações do arquivo de Status
             */
            isSucesso: false,
            sucesso: {
                /**
                 * Informações do Sistema Operacional
                 */
                os: {
                    /**
                     * Identificação do catalogo do SO
                     * 
                     * **Documentação do DF1: This register identifies the Catalog Number for the Operating System in the controller.**
                     * @type {Number}
                     */
                    catalogo: undefined,
                    /**
                     * Identificação do número da série do SO
                     * 
                     * **Documentação do DF1: This register identifies the Series letter for the Operating System in the controller**
                     * @type {String}
                     */
                    serie: undefined,
                    /**
                     * Identificação do FRN do SO 
                     * 
                     * **Documentação do DF1: This register identifies the FRN of the Operating System in the controller..**
                     * @type {Number}
                     */
                    revisao: undefined
                },
                /**
                 * Informações do Processador
                 */
                processador: {
                    /**
                     * Identificação do catalogo do processador
                     * 
                     * **Documentação do DF1: This register identifies the Catalog Number for the processor.**
                     * @type {String}
                     */
                    catalogo: undefined,
                    /**
                     * Identificação do número da série do processador
                     * 
                     * **Documentação do DF1: This register identifies the Series of the processor..**
                     * @type {String}
                     */
                    serie: undefined,
                    /**
                     * Identificação da revisão do processador
                     * 
                     * **Documentação do DF1: This register identifies the revision (Boot FRN) of the processor.**
                     * @type {Number}
                     */
                    revisao: undefined
                },
                /**
                 * Informações do programa que compilou o programa e enviou pro controlador
                 */
                compilacao: {
                    /**
                     * Identificação do Build Number do programa que compilou pro o programa no controlador
                     * 
                     * **Documentação do DF1: This register identifies the Build Number of the compiler that created the program in the controller.**
                     * @type {Number}
                     */
                    build: undefined,
                    /**
                     * Identificação do Release Number do programa que compilou pro o programa no controlador
                     * 
                     * **Documentação do DF1: This register identifies the Release of the compiler that created the program in the controller.**
                     */
                    release: undefined
                }
            },
            erro: {
                descricao: ''
            }
        }

        const layerBuilder = this.#ENIPSocket.getNovoLayerBuilder();

        // O CIP PCCC é onde vou setar os dados da solicitação de leitura
        const CIPPCCC = layerBuilder.buildSendRRData().criarServicoCIP().buildCIPPCCC();
        CIPPCCC.setServicePCCC(ServicosPCCC.ExecutePCCC.hex)

        // Comando PCCC
        const CommandData = CIPPCCC.getCommandData();

        // Como é uma leitura, uso o comando e função Protected Typed 3 Address Read
        let leituraTyped3AddressBuilder = CommandData.setAsCommandProtectedTyped3Address('Read');


        // O File Number do Status FIle é o 2 no MicroLogix 1400
        leituraTyped3AddressBuilder.setFileNumber(Buffer.from([0x02]));

        // O tipo de arquivo é Status
        leituraTyped3AddressBuilder.setFileType('Status');

        // Segundo o manual do MicroLogix1400, as informações começam do Index 57;
        // S:57 OS Catalog Number 
        // S:58 OS Series 
        // S:59 OS FRN 
        // S:60 Processor Catalog Number 
        // S:61 Processor Series 
        // S:62 Processor Revision 
        // S:63 User Program Functionality Type
        // S:64L Compiler Revision 
        // S:64H Compiler Revision
        leituraTyped3AddressBuilder.setElementNumber(Buffer.from([57]));

        // Vou ler até o index 63, como cada elemento tem 2 bytes, vou ler 2 x (ate onde eu quero) bytes pra frente, que ficaria 2 x 8 = 14 bytes
        leituraTyped3AddressBuilder.setByteSize(16);

        leituraTyped3AddressBuilder.setSubElementNumber(Buffer.from([0x00]));

        const respostaENIP = await this.#ENIPSocket.enviarENIP(layerBuilder);

        // Se a resposta não foi bem sucedida, analisar o erro
        if (!respostaENIP.isSucesso) {

            // Não deu pra enviar, devolver o erro ocorrido
            if (!respostaENIP.enipEnviar.isEnviou) {
                retornoVersion.erro.descricao = `${respostaENIP.enipEnviar.erro.descricao}`;
            } else if (respostaENIP.enipReceber.isRecebeu) {
                retornoVersion.erro.descricao = `${respostaENIP.enipReceber.erro.descricao}`;
            }

            return retornoVersion;
        }

        const parserENIP = respostaENIP.enipReceber.enipParser;
        if (!parserENIP.isSendRRData()) {
            retornoVersion.erro.descricao = 'A resposta ENIP recebida não é um comando SendRRData.';

            return retornoVersion;
        }

        const parserSendRRData = parserENIP.getAsSendRRData();
        if (!parserSendRRData.isValido().isValido) {
            retornoVersion.erro.descricao = `O Buffer SendRRData não é valido. Motivo: ${parserSendRRData.isValido().descricao}`;

            return retornoVersion;
        }

        const parserCIP = parserSendRRData.getAsServicoCIP();
        if (!parserCIP.isValido().isValido) {
            retornoVersion.erro.descricao = `O Buffer CIP não é valido. Motivo: ${parserCIP.isValido().descricao}`;

            return retornoVersion;
        }

        if (!parserCIP.isStatusSucesso().isSucesso) {
            retornoVersion.erro.descricao = `O status retornado do CIP não foi sucesso. Foi retornado o status ${parserCIP.isStatusSucesso().erro.codigo} - ${parserCIP.isStatusSucesso().erro.descricao}`;

            return retornoVersion;
        }

        const parserPCCC = parserCIP.getAsPCCC();
        if (!parserPCCC.isValido().isValido) {
            retornoVersion.erro.descricao = `O Buffer PCCC não é valido. Motivo: ${parserPCCC.isValido().descricao}`;

            return retornoVersion;
        }

        const parserPCCCResponseData = parserPCCC.getPCCCResponseData();

        if (!parserPCCCResponseData.isPCCCSucesso().isSucesso) {
            retornoVersion.erro.descricao = `O dispositivo não aceitou executar a solicitação PCCC. Código ${parserPCCCResponseData.isPCCCSucesso().erro.codigo} - ${parserPCCCResponseData.isPCCCSucesso().erro.descricao}`;

            return retornoVersion;
        }

        // Ok, se retornou sucesso eu deveria ter por fim o Function Specific Data que seria os bytes da leitura do Status File onde tem as informações que vou extrair, como OS, firmware, processador
        const bufferResposta = parserPCCCResponseData.getFunctionSpecificResponseData();
        if (bufferResposta.length == 0) {
            retornoVersion.erro.descricao = `O buffer de resposta não contém nenhum byte, não tem como extrair nada das informações do controlador.`;

            return retornoVersion;
        }

        // S:57 OS Catalog Number 
        // S:58 OS Series 
        // S:59 OS FRN 
        // S:60 Processor Catalog Number 
        // S:61 Processor Series 
        // S:62 Processor Revision 
        // S:63 User Program Functionality Type
        // S:64L Compiler Revision 
        // S:64H Compiler Revision

        const isPossuiBytes = (offset, quantidade) => {
            return bufferResposta.subarray(offset).length >= quantidade;
        }

        // Os 2 bytes do Buffer é o OS Catalog Number
        if (isPossuiBytes(0, 2)) {
            retornoVersion.sucesso.os.catalogo = bufferResposta.readUInt16LE(0);
        }

        // Os próximos 2 bytes são o OS Series
        if (isPossuiBytes(2, 2)) {
            retornoVersion.sucesso.os.serie = String.fromCharCode(65 + (bufferResposta.readUInt16LE(2) - 1));
        }

        // Os próximos 2 bytes são o OS FRN
        if (isPossuiBytes(4, 2)) {
            retornoVersion.sucesso.os.revisao = bufferResposta.readUInt16LE(4);
        }

        // Os próximos 2 bytes são o Processor Catalog Number
        if (isPossuiBytes(6, 2)) {
            retornoVersion.sucesso.processador.catalogo = bufferResposta.subarray(6, 8).toString('ASCII')
        }

        // Os próximos 2 bytes são o Processor Series
        if (isPossuiBytes(8, 2)) {
            retornoVersion.sucesso.processador.serie = String.fromCharCode(65 + (bufferResposta.readUInt16LE(8) - 1));
        }

        // Os próximos 2 bytes são o Processor Revision
        if (isPossuiBytes(10, 2)) {
            retornoVersion.sucesso.processador.revisao = bufferResposta.readUInt16LE(10);
        }

        // Ignoro o S:63 User Program Functionality Type

        if (isPossuiBytes(14, 2)) {

            const valorLido = bufferResposta.readUInt16LE(14);
            // Os 16 bits retornados contém o Build Number e o Release Number.

            // O Low Byte identifica o Build Number, utilizo somente os 8 bits
            retornoVersion.sucesso.compilacao.build = valorLido & 0xFF;

            // O High Byte identifica o Release Number, utilizo somente os 8 bits
            retornoVersion.sucesso.compilacao.release = (valorLido >> 8) & 0xFF;
        }

        retornoVersion.isSucesso = true;
        return retornoVersion;
    }

    /**
     * Envia uma solicitação de leitura do Status File e retorna o modo de operação do controlador
     */
    async readControllerMode() {
        const retornoControllerMode = {
            /**
             * Se foi possível realizar a leitura do Status File e encontrar o modo de operação atual
             */
            isSucesso: false,
            /**
             * Se sucesso, contém os detalhes adicionais.
             */
            sucesso: {
                /**
                 * Código do tipo do Modo do Controlador
                 */
                codigo: undefined,
                /**
                 * Descrição
                 */
                descricao: ''
            },
            /**
             * Se houve algum erro ao tentar realizar a leitura
             */
            erro: {
                descricao: ''
            }
        }

        const layerBuilder = this.#ENIPSocket.getNovoLayerBuilder();

        // O CIP PCCC é onde vou setar os dados da solicitação de leitura
        const CIPPCCC = layerBuilder.buildSendRRData().criarServicoCIP().buildCIPPCCC();
        CIPPCCC.setServicePCCC(ServicosPCCC.ExecutePCCC.hex)

        // Comando PCCC
        const CommandData = CIPPCCC.getCommandData();

        // Como é uma leitura, uso o comando e função Protected Typed 3 Address Read
        let leituraTyped3AddressBuilder = CommandData.setAsCommandProtectedTyped3Address('Read');

        // Leitura de 2 bytes
        leituraTyped3AddressBuilder.setByteSize(2);

        // O File Number do Status FIle é o 2 no MicroLogix 1400
        leituraTyped3AddressBuilder.setFileNumber(Buffer.from([0x02]));

        // O tipo de arquivo é Status
        leituraTyped3AddressBuilder.setFileType('Status');

        // O modo do controlador é salvo no index 1 do Status File S:1 (max 65 do MicroLogix 1400)
        leituraTyped3AddressBuilder.setElementNumber(Buffer.from([1]));
        leituraTyped3AddressBuilder.setSubElementNumber(Buffer.from([0x00]));

        const respostaENIP = await this.#ENIPSocket.enviarENIP(layerBuilder);

        // Se a resposta não foi bem sucedida, analisar o erro
        if (!respostaENIP.isSucesso) {

            // Não deu pra enviar, devolver o erro ocorrido
            if (!respostaENIP.enipEnviar.isEnviou) {
                retornoControllerMode.erro.descricao = `${respostaENIP.enipEnviar.erro.descricao}`;
            } else if (respostaENIP.enipReceber.isRecebeu) {
                retornoControllerMode.erro.descricao = `${respostaENIP.enipReceber.erro.descricao}`;
            }

            return retornoControllerMode;
        }

        const parserENIP = respostaENIP.enipReceber.enipParser;
        if (!parserENIP.isSendRRData()) {
            retornoControllerMode.erro.descricao = 'A resposta ENIP recebida não é um comando SendRRData.';

            return retornoControllerMode;
        }

        const parserSendRRData = parserENIP.getAsSendRRData();
        if (!parserSendRRData.isValido().isValido) {
            retornoControllerMode.erro.descricao = `O Buffer SendRRData não é valido. Motivo: ${parserSendRRData.isValido().descricao}`;

            return retornoControllerMode;
        }

        const parserCIP = parserSendRRData.getAsServicoCIP();
        if (!parserCIP.isValido().isValido) {
            retornoControllerMode.erro.descricao = `O Buffer CIP não é valido. Motivo: ${parserCIP.isValido().descricao}`;

            return retornoControllerMode;
        }

        // Se o layer do CIP for valido, validar se o status retornado é sucesso
        if (!parserCIP.isStatusSucesso().isSucesso) {
            retornoControllerMode.erro.descricao = `O status retornado do CIP não foi sucesso. Foi retornado o status ${parserCIP.isStatusSucesso().erro.codigo} - ${parserCIP.isStatusSucesso().erro.descricao}`;

            return retornoControllerMode;
        }

        // Se o CIP for válido, então eu vou sem duvidas ter as informações dos próximo layer que deveria ser o PCCC Object
        const parserPCCC = parserCIP.getAsPCCC();
        if (!parserPCCC.isValido().isValido) {
            retornoControllerMode.erro.descricao = `O Buffer PCCC não é valido. Motivo: ${parserPCCC.isValido().descricao}`;

            return retornoControllerMode;
        }

        // Beleza, com os layers confirmados, eu sei que recebi uma resposta PCCC válida.

        // O status da solicitação PCCC é diferente do status do CIP acima. A solicitação CIP só diz se o PCCC foi enviado e recebido, porém se a ação solicitada de certo é contida no PCCC Response Data, então preciso checar se foi sucesso
        const parserPCCCResponseData = parserPCCC.getPCCCResponseData();

        if (!parserPCCCResponseData.isPCCCSucesso().isSucesso) {
            retornoControllerMode.erro.descricao = `O dispositivo não aceitou executar a solicitação PCCC. Código ${parserPCCCResponseData.isPCCCSucesso().erro.codigo} - ${parserPCCCResponseData.isPCCCSucesso().erro.descricao}`;

            return retornoControllerMode;
        }

        // Ok, se retornou sucesso eu deveria ter por fim o Function Specific Data que seria os 2 bytes da leitura do Status File onde tem o modo do controlador

        const bufferResposta = parserPCCCResponseData.getFunctionSpecificResponseData();
        if (bufferResposta.length != 2) {
            retornoControllerMode.erro.descricao = `O buffer de resposta não contém 2 bytes. Foram retornados ${bufferResposta.length} bytes, o status do modo do controlador obrigatoriamente tem que ser 2 bytes.`;

            return retornoControllerMode;
        }

        // O estado do controlador é retornado pelos 16 bits. Porém somente os 5 primeiros bytes da direita pra esquerda são utilizados pra determinados o estado
        const valorLido = bufferResposta.readUInt16LE();

        // Valor dos primeiros 5 bits da direita pra esquerda
        const valorBitsIsolado = valorLido & 0b11111;

        const modoControlador = Object.values(ModoControlador).find((modo) => {
            return modo.id == valorBitsIsolado;
        });

        retornoControllerMode.isSucesso = true;
        retornoControllerMode.sucesso.codigo = valorBitsIsolado;

        if (modoControlador == undefined) {
            retornoControllerMode.sucesso.descricao = `Modo do controlador desconhecido`;
        } else {
            retornoControllerMode.sucesso.descricao = modoControlador.descricao;
        }

        return retornoControllerMode;
    }

    /**
     * Envia uma solicitação ListIdentity e retorna a identidade CIP do controlador
     */
    async readIdentidadeCIP() {
        let retornoIdenti = {
            /**
             * Se foi possível receber as informações do CIP desse controlador
             */
            isSucesso: false,
            sucesso: {
                /**
                 * Nome do dispositivo
                 * @type {String}
                 */
                nomeDispositivo: undefined,
                /**
                 * Numero serial
                 * @type {Number}
                 */
                serial: undefined,
                /**
                 * ID do fabricante, ex: Rockwell
                 * @type {Number}
                 */
                fabricanteId: undefined,
                /**
                 * Tipo de dispositivo, ex: 1766-L32BXB B/11.00 (depende do fabricante ID)
                 * @type {Number}
                 */
                tipoDispositivoId: undefined,
                /**
                 * Código do produto, ex: Programmable Logic Controller (dependo do tipo ID que depende do fabricante ID)
                 */
                codigoProduto: undefined,
                /**
                 * A versão do dispositivo. Ex: 3.5
                 * @type {String}
                 */
                versaoRevisao: undefined,
                /**
                 * A versão do protocolo de encapsulamento CIP(sempre deve ser 1)
                 */
                versaoProtocoloEncapsulamentoCIP: undefined,
                /**
                 * O status do dispositivo contém as informações do status atual dele, se ta em modo de erro, modo de erro recuperavél, etc...(tem que isolar os bits pois cada x parte significa algo.)
                 * @type {Number}
                 */
                statusDispositivo: undefined,
                /**
                 * Endereço Ethernet do dispositivo
                 */
                endereco: {
                    /**
                     * IP em string xxx.xxx.xxx.xxx
                     * @type {String}
                     */
                    ip: undefined,
                    /**
                     * Porta utilizada
                     * @type {Number}
                     */
                    porta: undefined
                }
            },
            erro: {
                descricao: ''
            }
        }

        let novoLayerBuilder = this.#ENIPSocket.getNovoLayerBuilder();
        novoLayerBuilder.buildListIdentity();

        const respostaENIP = await this.#ENIPSocket.enviarENIP(novoLayerBuilder);
        if (!respostaENIP.isSucesso) {

            if (!respostaENIP.enipEnviar.isEnviou) {
                retornoIdenti.erro.descricao = `${respostaENIP.enipEnviar.erro.descricao}`;
            } else if (!respostaENIP.enipReceber.isRecebeu) {
                retornoIdenti.erro.descricao = `${respostaENIP.enipReceber.erro.descricao}`;
            }

            return retornoIdenti;
        }

        const parserENIP = respostaENIP.enipReceber.enipParser;

        if (!parserENIP.isListIdentity()) {
            retornoIdenti.erro.descricao = 'O buffer ENIP recebido não é um comando ListIdentity';

            return retornoIdenti;
        }

        const parserListIdentity = parserENIP.getAsListIdentity();
        if (!parserListIdentity.isValido().isValido) {
            retornoIdenti.erro.descricao = `O buffer ListIdentity não é valido. Motivo: ${parserListIdentity.isValido().descricao}`;

            return retornoIdenti;
        }

        retornoIdenti.isSucesso = true;

        let identidadeCIP = parserListIdentity.getIdentidadeCIP();

        retornoIdenti.sucesso.codigoProduto = identidadeCIP.codigo_produto;
        retornoIdenti.sucesso.endereco = {
            ip: identidadeCIP.endereco_socket.endereco,
            porta: identidadeCIP.endereco_socket.porta
        }
        retornoIdenti.sucesso.fabricanteId = identidadeCIP.fabricante_id;
        retornoIdenti.sucesso.nomeDispositivo = identidadeCIP.nome_dispositivo;
        retornoIdenti.sucesso.serial = identidadeCIP.numero_serial;
        retornoIdenti.sucesso.statusDispositivo = identidadeCIP.status_dispositivo;
        retornoIdenti.sucesso.tipoDispositivoId = identidadeCIP.tipo_dispositivo;
        retornoIdenti.sucesso.versaoProtocoloEncapsulamentoCIP = identidadeCIP.versao_protocolo_encapsulamento;
        retornoIdenti.sucesso.versaoRevisao = identidadeCIP.versao_revisao;

        return retornoIdenti;
    }

    /**
     * Logar uma mensagem
     * @param {String} msg 
     */
    log(msg) {
        this.#estado.emissorEvento.disparaEvento('log', msg);
        if (!this.#configuracao.logs.habilitarLogsConsole) return;

        let dataAgora = new Date();
        let dataFormatada = `${dataAgora.getDate().toString().padStart(2, '0')}/${(dataAgora.getMonth() + 1).toString().padStart(2, '0')}/${dataAgora.getFullYear()} ${dataAgora.getHours().toString().padStart(2, '0')}:${dataAgora.getMinutes().toString().padStart(2, '0')}:${dataAgora.getSeconds().toString().padStart(2, '0')}`;

        let conteudoMsg = ''
        if (typeof msg == 'object') {
            conteudoMsg = JSON.stringify(msg);
        } else {
            conteudoMsg = msg;
        }

        console.log(`[${dataFormatada}] [MicroLogix 1400] - ${conteudoMsg}`);
    }
}

/**
 * Possíveis estados que um controlador deve estar
 */
const ModoControlador = {
    RemoteDownloadInProgress: {
        id: 0,
        descricao: "Remote download in progress."
    },
    RemoteProgram: {
        id: 1,
        descricao: "Remote Program mode."
    },
    RemoteSuspend: {
        id: 3,
        descricao: "Remote suspend mode. Operation halted by execution of the SUS instruction."
    },
    RemoteRun: {
        id: 6,
        descricao: "Remote Run mode."
    },
    RemoteTestContinuous: {
        id: 7,
        descricao: "Remote Test continuous mode."
    },
    RemoteTestSingleScan: {
        id: 8,
        descricao: "Remote Test single scan mode."
    },
    DownloadInProgress: {
        id: 16,
        descricao: "Download in progress."
    },
    Program: {
        id: 17,
        descricao: "Program mode."
    },
    Suspend: {
        id: 27,
        descricao: "Suspend mode. Operation halted by execution of the SUS instruction."
    },
    Run: {
        id: 30,
        descricao: "Run mode."
    }
}