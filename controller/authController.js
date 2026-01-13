const supabase = require("../util/supabaseClient");
const catchAsync = require("../util/catchAsync");
const AppError = require("../util/appError");

//parse stringified JSON if needed
function parseIfJsonString(val) {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch (e) {
      return val;
    }
  }
  return val;
}

/** ------------------ SIGN UP ------------------ **/
exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return next(new AppError("All fields are required", 400));
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });

  if (error || !data.user) {
    return next(new AppError(error.message || "Signup failed", 400));
  }

  const responseData = parseIfJsonString(data);

  res.status(201).json({
    status: "success",
    data: responseData,
  });
});

/** ------------------ LOGIN ------------------ **/
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  console.log("Login request received for email:", email);
  console.log("Password received:", password ? "Yes" : "No");

  if (!email || !password)
    return next(new AppError("email and password are required", 400));

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.session)
    return next(new AppError(error.message || "Invalid credentials.", 400));

  const authUser= data.session.user;

  const token = data.session.access_token;
  const responseData = parseIfJsonString(data);
  console.log("Login successful for email:", email);

  const supaUser = responseData.session.user;

  const { data: profile, error: profileError } = await supabase
  .from('users')              
  .select('*')
  .eq('id', authUser.id)      
  .single();

  if (profileError) {
    return next(new AppError('User profile not found', 404));
  }

  res.status(200).json({
    status: "success",
    token: token,
    data: {
      id: supaUser.id,
      name: profile.name,
      email: supaUser.email,
      connections: profile.connections || [],
      createdAt: profile.created_at,
    },
  });
});

/** ------------------ FORGOT PASSWORD ------------------ **/
exports.forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required." });

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
  });

  if (error) return res.status(400).json({ error: error.message });

  return res.json({ message: "Password reset email sent." });
});

/** ------------------ RESET PASSWORD ------------------ **/
exports.resetPassword = catchAsync(async (req, res) => {
  const { access_token, newPassword } = req.body;

  if (!access_token || !newPassword)
    return res
      .status(400)
      .json({ error: "Token and new password are required." });

  const { error } = await supabase.auth.updateUser(
    { password: newPassword },
    { accessToken: access_token }
  );

  if (error) return res.status(400).json({ error: error.message });

  return res.json({ message: "Password updated successfully." });
});

/** ------------------ LOGOUT ------------------ **/
exports.logout = catchAsync(async (req, res) => {
  const { error } = await supabase.auth.signOut();

  if (error) return next(new AppError(error.message, 400));

  res.status(200).json({ status: "success", message: "Logout successful." });
});

/** ------------------ Protect ------------------ **/
exports.protect = catchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token)
    return next(
      new AppError("You are not logged in! Please login to get access")
    );

  const { data: user, error } = await supabase.auth.getUser(token);

  if (error || !user)
    return next(
      new AppError(
        "User does not exist or the token has expired! Please login again"
      )
    );

  req.user = user;
  next();
});
