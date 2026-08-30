const SUPABASE_URL = "https://cnqeqehgpidrsuerjzbg.supabase.co";
const SUPABASE_KEY = "sb_publishable_voofaOaydNBIQvXKMXZ2lA_Daj2GPXU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const form = document.getElementById("requestForm");
const message = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";
  message.textContent = "";

  const priority = document.querySelector(
    'input[name="priority"]:checked'
  ).value;

  const request = {
    requester_name: document.getElementById("requester_name").value.trim(),
    location: document.getElementById("location").value.trim(),
    request_type: document.getElementById("request_type").value,
    description: document.getElementById("description").value.trim(),
    priority,
    status: "new"
  };

  const { error } = await supabaseClient
    .from("Requests")
    .insert([request]);

  if (error) {
    console.error(error);
    message.textContent = "Request failed. Please try again.";
    message.className = "message error";
  } else {
    message.textContent = "Request received. Engineering has it.";
    message.className = "message success";
    form.reset();

    document.querySelector(
      'input[name="priority"][value="normal"]'
    ).checked = true;
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "Submit Request";
});