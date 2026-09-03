import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateBusinessOwnerRequest {
  business_id: string;
  owner_email: string;
  owner_full_name: string;
  owner_phone?: string;
  owner_password: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the caller is authenticated and is a super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("is_super_admin")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError || !profile?.is_super_admin) {
      return new Response(JSON.stringify({ error: "Only super admins can create business owners" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: CreateBusinessOwnerRequest = await req.json();
    const { business_id, owner_email, owner_full_name, owner_phone, owner_password } = body;

    if (!business_id || !owner_email || !owner_full_name || !owner_password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", owner_email)
      .maybeSingle();

    let userId: string;

    if (existingProfile) {
      // User already exists — just link them to the business
      userId = existingProfile.id;
    } else {
      // Create new auth user with service role key
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: owner_email,
        password: owner_password,
        email_confirm: true,
        user_metadata: {
          full_name: owner_full_name,
          phone: owner_phone || null,
        },
      });

      if (createError || !newUser.user) {
        return new Response(JSON.stringify({ error: createError?.message || "Failed to create user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = newUser.user.id;

      // Update profile with phone if provided
      if (owner_phone) {
        await adminClient.from("profiles").update({ phone: owner_phone }).eq("id", userId);
      }
    }

    // Add as business member with owner role
    const { error: memberError } = await adminClient.from("business_members").upsert({
      business_id,
      user_id: userId,
      role: "owner",
      status: "active",
    }, { onConflict: "business_id,user_id" });

    if (memberError) {
      return new Response(JSON.stringify({ error: `Failed to add business member: ${memberError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set active business
    await adminClient.from("profiles").update({ active_business_id: business_id }).eq("id", userId);

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      owner_email,
      owner_full_name,
      already_existed: !!existingProfile,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
