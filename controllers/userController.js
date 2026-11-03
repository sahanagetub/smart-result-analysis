const userService = require('../services/userService');

async function createUser(req, res, next) {
  try {
    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    const id = await userService.createUserService(req.body, requesterRole);
    const user = await userService.getUserService(id, requesterRole);
    // Never return password hash
    const { password_hash, ...safeUser } = user;
    res.status(201).json({ success: true, data: safeUser, message: 'User created successfully.' });
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    const users = await userService.listUsersService(requesterRole);
    // Strip password hashes
    const safeUsers = users.map(({ password_hash, ...u }) => u);
    res.json({ success: true, data: safeUsers });
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
    const user = await userService.updateUserService(req.params.id, req.body, requesterRole);
    const { password_hash, ...safeUser } = user;
    res.json({ success: true, data: safeUser, message: 'User updated successfully.' });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    await userService.deleteUserService(req.params.id, requesterRole);
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
