let connection = null;

export class Socket {  
    socket = null;
    constructor() {
        this.socket = null;
    }

    connect(server) {

        const io = require("socket.io")(server, {
            path: '/patentrack-socket'
        });

        io.on("connection", (socket) => {
            console.log('Socket connection established.....')
           this.socket = socket;
        });
    }

    emit(event, data) {
        this.socket.emit(event, data);
    }

    static init(server) {
        if (!connection) {
            connection = new Socket();
            connection.connect(server);
        }
    }

    static getConnection() {
        if (connection) {
          return connection;
        }
    }
}

export default {
    connect: Socket.init,
    connection: Socket.getConnection
}