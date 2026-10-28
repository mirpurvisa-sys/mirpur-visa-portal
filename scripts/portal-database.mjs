import { Client } from "pg";
import { Resolver } from "node:dns/promises";
import dotenv from "dotenv";
export async function connectPortalDatabase() {
  dotenv.config({path:".env.local",quiet:true}); dotenv.config({quiet:true});
  const url=new URL(process.env.DATABASE_URL);url.searchParams.delete("sslmode");
  const host=url.hostname;
  const make=()=>new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:false,servername:host},connectionTimeoutMillis:8000});
  let db=make();
  try {await db.connect();return db;} catch(error) {
    await db.end().catch(()=>{});
    if(!["EAI_AGAIN","ENOTFOUND"].includes(error.code))throw error;
    const resolver=new Resolver({timeout:3000,tries:1});resolver.setServers(["1.1.1.1"]);
    url.hostname=(await resolver.resolve4(host))[0];db=make();await db.connect();return db;
  }
}
