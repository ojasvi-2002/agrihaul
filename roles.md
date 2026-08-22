# SaaS User Roles, Permissions & Dashboard Architecture

I want you to understand and implement the user/role structure of this SaaS correctly.

This is a **multi-tenant SaaS platform**. Multiple customer organisations will use the same platform, but each organisation's data must be completely isolated from every other organisation.

There are **3 main types of users**.

---

## 1. SUPER ADMIN / PLATFORM OWNER

This is me, the owner of the entire SaaS platform.

When I log in as the Super Admin, I should NOT see the same dashboard as a normal customer.

I need a completely separate **Platform Owner / Super Admin Dashboard**.

The Super Admin has global access to the entire platform.

### Super Admin should be able to see:

- All customer organisations
- All organisation admins
- All organisation employees
- All farmers
- All trucks
- All drivers
- All dispatches
- All jobs/orders
- All operational activity
- Payments
- Subscriptions
- Revenue
- Organisation usage
- Account status
- Active/inactive organisations
- Billing issues
- System activity
- Audit logs
- Platform settings
- Any other important SaaS-level information

### Super Admin should be able to manage:

- Create organisations
- Edit organisations
- Suspend organisations
- Activate organisations
- Delete/deactivate organisations where appropriate
- Create or manage organisation admins
- Manage users
- View organisation data
- Manage subscriptions/payments
- View platform-wide analytics
- Access an organisation when support or management requires it

The Super Admin is effectively the **owner of the entire SaaS**.

The Super Admin should have global visibility and control.

---

# 2. ORGANISATION ADMIN

An Organisation Admin belongs to exactly one customer organisation.

For example:

**Organisation: ABC Transport**

The Organisation Admin for ABC Transport can ONLY access ABC Transport's data.

They must never be able to see data belonging to:

- Organisation B
- Organisation C
- Any other customer

This tenant isolation is extremely important.

### Organisation Admin can manage their organisation's:

- Employees
- Trucks
- Drivers
- Farmers
- Dispatches
- Jobs/orders
- Operational data
- Organisation settings
- Reports
- Their organisation's users
- Their organisation's subscription/billing information, if applicable

They should have a management dashboard for their organisation.

For example:

**ABC Transport Dashboard**

- 25 trucks
- 180 farmers
- 4 employees
- Today's dispatches
- Active jobs
- Completed jobs
- Pending jobs
- Operational statistics
- Reports

But they should NOT have access to the Super Admin dashboard.

They should NOT see other organisations.

---

# 3. EMPLOYEE / DISPATCHER

The third type of user is an employee who performs the everyday operational work.

This user also belongs to an organisation.

Their interface should be focused on **operations**, not administration.

For example, one employee might be responsible for approximately:

- 100 trucks
- Their associated farmers
- Their dispatches
- Their daily jobs

The employee should be able to handle the operational work assigned to them.

### Employee/Dispatcher should be able to:

- View assigned trucks
- View relevant farmers
- View dispatches
- Create/update dispatches where permitted
- View jobs/orders
- Update operational statuses
- Search and filter trucks/farmers/jobs
- Handle daily dispatch operations
- See the information necessary to perform their job

The employee should NOT have access to:

- Other organisations
- Platform-wide data
- Super Admin functions
- Platform payments
- Other customers
- Organisation-level administrative controls
- User permission management
- Sensitive SaaS settings

Their dashboard should be simple and focused on getting their daily operational work done.

---

# IMPORTANT: MULTI-TENANT DATA ISOLATION

This is one of the most important requirements.

Every organisation must have its own isolated data.

For example:

```text
Organisation A
├── Admin
├── Employees
├── Trucks
├── Farmers
├── Drivers
└── Dispatches

Organisation B
├── Admin
├── Employees
├── Trucks
├── Farmers
├── Drivers
└── Dispatches
```

Organisation A users must NEVER accidentally receive Organisation B data.

This must be enforced at the backend/database/API level, not merely by hiding things in the frontend.

Do not rely on frontend permissions for security.

Every request that accesses organisation-specific data must verify that the authenticated user is allowed to access that organisation's data.

---

# PERMISSION HIERARCHY

Think of the system like this:

```text
SUPER ADMIN / PLATFORM OWNER
        │
        ├── Organisation A
        │      ├── Organisation Admin
        │      ├── Employee / Dispatcher
        │      ├── Employee / Dispatcher
        │      ├── Trucks
        │      ├── Farmers
        │      └── Dispatches
        │
        ├── Organisation B
        │      ├── Organisation Admin
        │      ├── Employees
        │      ├── Trucks
        │      ├── Farmers
        │      └── Dispatches
        │
        └── Organisation C
               ├── Organisation Admin
               ├── Employees
               ├── Trucks
               ├── Farmers
               └── Dispatches
```

The basic permission model is:

```text
SUPER ADMIN
Everything across the entire platform

ORGANISATION ADMIN
Everything within their own organisation that an organisation admin is permitted to manage

EMPLOYEE / DISPATCHER
Operational functionality within their own organisation, limited according to their permissions/assignment
```

---

# IMPORTANT IMPLEMENTATION RULE

Do NOT build all three users with the same dashboard and simply hide menu items.

The application should understand these as genuinely different roles with different permissions.

The backend should enforce permissions.

The frontend should then reflect those permissions.

I want a proper role-based access control system combined with organisation/tenant isolation.

Before implementing this, first inspect the existing application and explain:

1. Current authentication architecture
2. Current user model
3. Current organisation/tenant model
4. Current database structure
5. Current permissions
6. What needs to change to support this architecture

Then implement the architecture carefully without unnecessarily breaking existing functionality.

Do not make assumptions about permissions that I have not specified. If something is ambiguous, identify it clearly before making a potentially dangerous architectural decision.