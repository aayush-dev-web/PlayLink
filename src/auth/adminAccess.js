export const designatedAdminEmail = 'aayushfourth@gmail.com'

export function isDesignatedAdminEmail(email) {
  return email?.trim().toLowerCase() === designatedAdminEmail
}

export function isDesignatedAdmin(user) {
  return isDesignatedAdminEmail(user?.email)
}
