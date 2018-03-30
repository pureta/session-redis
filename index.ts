import * as crypto from "crypto";
import * as redisSession from "connect-redis";
import * as expressSession from "express-session";
import * as pureta from "pureta";
import * as redis from "redis";

export default class SessionRedisPlugin extends pureta.Plugin {
    public static client: redis.RedisClient;

    dirs = {};

    /** Promisified version of redis commands */
    static async run<Result>(command: keyof redis.RedisClient, ...args: any[]): Promise<Result> {
        return new Promise<Result>((resolve, reject) => {
            (<any>this.client)[command](...args, (err: Error, result: Result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

    async registerHandlers() {
        this.app.on("app:start", this.onAppStart.bind(this));
        this.app.on("server:init", this.onServerInit.bind(this));
        this.app.on("app:stop", this.onAppStop.bind(this));
    }

    private async onAppStart() {
        const config = this.app.configs.global.buildToObject("plugins.@pureta.session-redis.");
        if (Object.keys(config).length === 0) {
            throw new Error("No configuration found for @pureta/session-redis! (Should be in /config/plugins/@pureta/session-redis.json)");
        }
        this.app.logger.info(`port ${config.port}, host ${config.host}`);
        const client = redis.createClient(config.port, config.host);
        await new Promise((resolve, reject) => {
            client.on("error", reject);
            client.on("ready", resolve);
        });
        SessionRedisPlugin.client = client;
    }

    private async onServerInit() {
        this.app.server.middleware["session"] = expressSession({
            store: new (redisSession(expressSession))({
                client: SessionRedisPlugin.client
            }),
            resave: true,
            saveUninitialized: false,
            secret: this.app.configs.global.get("plugins.@pureta.session-redis.secret") || crypto.randomBytes(16).toString("hex")
        });
    }

    private async onAppStop() {
        await new Promise((resolve) => SessionRedisPlugin.client.quit(resolve));
    }
}
