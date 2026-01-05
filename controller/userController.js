const supabase = require('../util/supabaseClient');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');




// Return current logged-in user (populated by authController.protect)
exports.getMe = catchAsync(async (req, res, next) => {
    if (!req.user) return next(new AppError('Not authenticated', 401));

    const {data, error} = await supabase.from('users').select('*').eq('id', req.user.id);

    if(error) {
        return next(new AppError(error.message || 'User not found', 400));
    }

    res.status(200).json({ status: 'success', data });
});