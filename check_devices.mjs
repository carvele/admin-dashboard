
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env" });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data, error } = await supabase.from("devices").select("fingerprint, staff_email, user_agent, last_seen").limit(10);
    console.log(error ? error : JSON.stringify(data, null, 2));
    
    const { count } = await supabase.from("devices").select("*", { count: "exact", head: true });
    console.log("Total devices:", count);
}
check();

