const User = require("../models/User");
const Post = require("../models/Post");
const { sendEmail } = require("../middlewares/sendEmail");
const crypto = require("crypto");

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        let user = await User.findOne({ email });
        if (user) {
            return res
                .status(400)
                .json({ success: false, message: "User already exists" });
        }

        user = await User.create({
            name,
            email,
            password,
            avatar: { public_id: "sample_id", url: "sampleurl" },
        });

        const token = await user.generateToken();
        const options = {
            expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            httpOnly: true,
        };
        res.status(201)
            .cookie("token", token, options)
            .json({ success: true, user, token });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email }).select("+password");

        if (!user) {
            return res
                .status(400)
                .json({ success: false, message: "User does not exist" });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res
                .status(400)
                .json({ success: false, message: "Incorrect password" });
        }

        const token = await user.generateToken();
        const options = {
            expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            httpOnly: true,
        };
        res.status(200)
            .cookie("token", token, options)
            .json({ success: true, user, token });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.logout = async (req, res) => {
    try {
        res.status(200)
            .cookie("token", null, {
                expires: new Date(Date.now()),
                httpOnly: true,
            })
            .json({
                success: true,
                message: "Logged out",
            });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.followUser = async (req, res) => {
    try {
        const userToFollow = await User.findById(req.params.id);
        const loggedInUser = await User.findById(req.user._id);

        if (!userToFollow) {
            return res
                .status(404)
                .json({ success: false, message: "User does not exist" });
        }

        if (loggedInUser.following.includes(userToFollow._id)) {
            const indexfollowing = loggedInUser.following.indexOf(
                userToFollow._id
            );
            const indexfollowers = userToFollow.followers.indexOf(
                loggedInUser._id
            );

            loggedInUser.following.splice(indexfollowing, 1);
            userToFollow.followers.splice(indexfollowers, 1);

            await userToFollow.save();
            await loggedInUser.save();
            return res
                .status(200)
                .json({ success: true, message: "Unfollowed" });
        } else {
            loggedInUser.following.push(userToFollow._id);
            userToFollow.followers.push(loggedInUser._id);

            await loggedInUser.save();
            await userToFollow.save();
            res.status(200).json({ success: true, message: "Followed" });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id).select("+password");

        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: "User does not exist" });
        }

        if (!oldPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Please provide old and new password",
            });
        }

        const isMatch = await user.matchPassword(oldPassword);
        if (!isMatch) {
            return res
                .status(400)
                .json({ success: false, message: "Incorrect password" });
        }

        user.password = newPassword;
        await user.save();
        res.status(200).json({ success: true, message: "Password updated" });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const { name, email } = req.body;

        if (name) {
            user.name = name;
        }
        if (email) {
            user.email = email;
        }

        await user.save();
        res.status(200).json({ success: true, message: "Profile updated" });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.deleteMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const posts = user.posts;
        const followers = user.followers;
        const userId = user._id;
        const following = user.following;

        await user.remove();
        res.cookie("token", null, {
            expires: new Date(Date.now()),
            httpOnly: true,
        });
        for (let i = 0; i < posts.length; i++) {
            const post = await Post.findById(posts[i]);
            await post.remove();
        }
        for (let i = 0; i < followers.length; i++) {
            const follower = await User.findById(followers[i]);
            const index = follower.following.indexOf(userId);
            follower.following.splice(index, 1);
            await follower.save();
        }
        for (let i = 0; i < following.length; i++) {
            const follows = await User.findById(following[i]);
            const index = follows.followers.indexOf(userId);
            follows.following.splice(index, 1);
            await follows.save();
        }
        res.status(200).json({ success: true, message: "Profile deleted" });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.MyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate("posts");
        res.status(200).json({ success: true, user });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate("posts");
        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: "User does not exist" });
        }
        res.status(200).json({ success: true, user });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({});
        res.status(200).json({ success: true, users });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: "User does not exist" });
        }
        const resetPasswordToken = user.getResetPasswordToken();

        await user.save();
        const resetUrl = `${req.protocol}://${req.get(
            "host"
        )}/api/v1/password/reset/${resetPasswordToken}`;
        const message = `You are receiving this email because you (or someone else) have requested the reset of a password. Please make a POST request with the url below. If you did not request this, please ignore this email and your password will remain unchanged.\n\n${resetUrl}`;
        try {
            await sendEmail({
                email: user.email,
                subject: "Reset Password",
                message,
            });
            res.status(200).json({
                success: true,
                message: `Email sent to ${user.email}`,
            });
        } catch (error) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save();
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const resetPasswordToken = crypto
            .createHash("sha256")
            .update(req.params.token)
            .digest("hex");
        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() },
        });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Password reset token is invalid or has expired",
            });
        }
        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();
        res.status(200).json({ success: true, message: "Password updated" });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};
