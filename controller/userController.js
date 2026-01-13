const supabase = require('../util/supabaseClient');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');




// Return current logged-in user (populated by authController.protect)
exports.getMe = catchAsync(async (req, res, next) => {
    if (!req.user) return next(new AppError('Not authenticated', 401));
    if (!req.user.id) return next(new AppError('Invalid user identifier', 400));

    const {data, error} = await supabase.from('users').select('*').eq('id', String(req.user.id));

    if(error) {
        return next(new AppError(error.message || 'User not found', 400));
    }

    res.status(200).json({ status: 'success', data });
});

exports.getSessionStudents = catchAsync(async (req, res, next) => {
    // Accept session_id from either query string (?session_id=...) or request body
        const rawId = (req.query && req.query.session_id) || (req.body && req.body.session_id);

        if (!rawId) return next(new AppError('Missing session_id in request (query or body)', 400));

        const sessionId = String(rawId);

        // Ensure the provided session_id is a UUID (we require the real session UUID)
        const uuidV4 = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
        if (!uuidV4.test(sessionId)) {
          return next(new AppError('session_id must be a valid UUID. Please provide the session UUID (sessions.id).', 400));
        }

        const {data, error} = await supabase.from('session_students').select('student_name, student_email, created_at').eq('session_id', sessionId);
    if(error) {
        return next(new AppError(error.message || 'Could not find any students who joined this session', 400));
    }

    res.status(200).json({
        status: 'success',
        data
    });
});