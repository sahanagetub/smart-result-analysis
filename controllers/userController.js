const userService = require('../services/userService');

async function createUser(req, res, next) {
  try {
    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    const id = await userService.createUserService(req.body, requesterRole);
    const user = await userService.getUserService(id, requesterRole);
    // Never return password hash
    const safeUser = { ...user };
    res.status(201).json({ success: true, data: safeUser, message: 'User created successfully.' });
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    const users = await userService.listUsersService(requesterRole);
    const counts = await userService.countUsersService(requesterRole);
    const safeUsers = users.map(({ password_hash, ...user }) => user);
    res.json({ success: true, data: safeUsers, counts });
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  try {
    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    const user = await userService.getUserService(req.params.id, requesterRole);
    const { password_hash, ...safeUser } = user;
    res.json({ success: true, data: safeUser });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    const requesterUsername = req.session?.user?.username || req.session?.userId;
    const user = await userService.updateUserService(req.params.id, req.body, requesterRole, requesterUsername);
    res.json({ success: true, data: user, message: 'User updated successfully.' });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    const requesterUsername = req.session?.user?.username || req.session?.userId;
    await userService.deleteUserService(req.params.id, requesterRole, requesterUsername);
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    next(err);
  }
}

async function countUsers(req, res, next) {
  try {
    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    const counts = await userService.countUsersService(requesterRole);
    res.json({ success: true, data: counts });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  countUsers
};
