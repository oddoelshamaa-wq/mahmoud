from flask import Flask, render_template, request, redirect, url_for, send_file, Response, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
import csv
import io
from functools import wraps

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///payroll.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = 'your-secret-key-change-this'
db = SQLAlchemy(app)


class Branch(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    employees = db.relationship('Employee', backref='branch', lazy=True)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    permissions = db.Column(db.String(500), default='')  # comma-separated permissions
    branch_ids = db.Column(db.String(500), default='')  # comma-separated branch IDs assigned to this user


class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    branch_id = db.Column(db.Integer, db.ForeignKey('branch.id'), nullable=False)
    daily_wage = db.Column(db.Float, default=0.0)
    hourly_wage = db.Column(db.Float, default=0.0)
    insurance_deduction = db.Column(db.Float, default=0.0)  # التامينات الشهرية
    attendances = db.relationship('Attendance', backref='employee', lazy=True)
    advances = db.relationship('Advance', backref='employee', lazy=True)
    withdrawals = db.relationship('Withdrawal', backref='employee', lazy=True)


class Attendance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    arrival_time = db.Column(db.String(5), default=None)  # HH:MM format
    departure_time = db.Column(db.String(5), default=None)  # HH:MM format
    hours_worked = db.Column(db.Float, default=0.0)
    is_absent = db.Column(db.Boolean, default=False)
    late_minutes = db.Column(db.Integer, default=0)


class Advance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    months = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Withdrawal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    withdrawal_date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


def init_db():
    db.create_all()
    # Create default admin user if not exists
    if not User.query.filter_by(username='admin').first():
        admin = User(username='admin', password='admin123', is_admin=True, permissions='view_manual_entry,view_branches,view_daily_report,view_payroll,view_users,manage_attendance,manage_employees,manage_advances,print_receipts,delete_branch')
        db.session.add(admin)
        db.session.commit()


def get_user_branches(user):
    """Get branches available to the user"""
    if user.is_admin:
        return Branch.query.all()
    # Regular user: only their assigned branches
    if not user.branch_ids:
        return []
    branch_ids = [int(bid.strip()) for bid in user.branch_ids.split(',') if bid.strip()]
    return Branch.query.filter(Branch.id.in_(branch_ids)).all()


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


def check_permission(permission):
    """Decorator to check if user has a specific permission"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return redirect(url_for('login'))
            user = User.query.get(session['user_id'])
            if user.is_admin:
                return f(*args, **kwargs)
            if permission not in user.permissions.split(','):
                return redirect(url_for('index'))
            return f(*args, **kwargs)
        return decorated_function
    return decorator


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username, password=password).first()
        if user:
            session['user_id'] = user.id
            session['username'] = user.username
            return redirect(url_for('index'))
        else:
            return render_template('login.html', error='بيانات الدخول غير صحيحة')
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


def compute_pay_for_employee(employee, month, year, withdrawal_date=None):
    # gather attendances for given month (up to the withdrawal date)
    from sqlalchemy import extract
    atts = Attendance.query.filter_by(employee_id=employee.id).filter(extract('month', Attendance.date) == month, extract('year', Attendance.date) == year)
    
    if withdrawal_date:
        atts = atts.filter(Attendance.date <= withdrawal_date)
    
    atts = atts.all()

    days_present = 0
    absence_days = 0
    total_hours = 0.0
    total_overtime = 0.0
    late_minutes = 0
    short_hours_deduction = 0.0

    for a in atts:
        if a.is_absent:
            absence_days += 1
        else:
            days_present += 1
            total_hours += a.hours_worked
            if a.hours_worked > 9:
                total_overtime += (a.hours_worked - 9)
            elif a.hours_worked < 9:
                short_hours_deduction += (9 - a.hours_worked)
        late_minutes += a.late_minutes or 0

    base_pay = days_present * employee.daily_wage
    # overtime paid at 1.5x hourly wage
    overtime_pay = total_overtime * employee.hourly_wage * 1.5
    # deduction for short hours
    short_hours_pay_deduction = short_hours_deduction * employee.hourly_wage
    # late deduction: convert minutes to hours
    late_deduction = (late_minutes / 60.0) * employee.hourly_wage
    # absence deduction: full daily wage per absent day
    absence_deduction = absence_days * employee.daily_wage

    # monthly advance repayment: split each advance across its months
    advances = Advance.query.filter_by(employee_id=employee.id).all()
    monthly_adv_repayment = 0.0
    for adv in advances:
        if adv.months and adv.months > 0:
            monthly_adv_repayment += adv.amount / adv.months

    # insurance deduction
    insurance_deduction = employee.insurance_deduction or 0.0
    
    gross = base_pay + overtime_pay
    total_deductions = absence_deduction + late_deduction + short_hours_pay_deduction + monthly_adv_repayment + insurance_deduction
    net = gross - total_deductions

    return {
        'employee': employee,
        'days_present': days_present,
        'absence_days': absence_days,
        'base_pay': base_pay,
        'overtime_pay': overtime_pay,
        'late_deduction': late_deduction,
        'short_hours_deduction': short_hours_pay_deduction,
        'monthly_adv_repayment': monthly_adv_repayment,
        'insurance_deduction': insurance_deduction,
        'gross': gross,
        'total_deductions': total_deductions,
        'net': net,
        'total_hours': total_hours,
        'overtime_hours': total_overtime,
    }


@app.route('/manual-entry', methods=['GET', 'POST'])
@login_required
@check_permission('view_manual_entry')
def manual_entry():
    branches = Branch.query.all()
    user = User.query.get(session['user_id'])
    branches = get_user_branches(user)
    if request.method == 'POST':
        branch_id = request.form.get('branch_id')
        employee_name = request.form.get('employee_name')
        entry_date = request.form.get('entry_date')
        arrival_time = request.form.get('arrival_time')
        departure_time = request.form.get('departure_time')
        is_absent = request.form.get('is_absent') == 'on'
        late_minutes = int(request.form.get('late_minutes') or 0)
        daily_wage = float(request.form.get('daily_wage') or 0)
        hourly_wage = float(request.form.get('hourly_wage') or 0)
        insurance_deduction = float(request.form.get('insurance_deduction') or 0)
        
        # Calculate hours worked from arrival and departure times
        hours_worked = 0
        if arrival_time and departure_time and not is_absent:
            try:
                arr = datetime.strptime(arrival_time, '%H:%M')
                dep = datetime.strptime(departure_time, '%H:%M')
                hours_worked = (dep - arr).total_seconds() / 3600
                if hours_worked < 0:
                    hours_worked += 24
            except:
                hours_worked = float(request.form.get('hours') or 0)
        else:
            hours_worked = float(request.form.get('hours') or 0)
        
        # Find or create employee
        emp = Employee.query.filter_by(name=employee_name, branch_id=branch_id).first()
        if not emp:
            emp = Employee(name=employee_name, branch_id=branch_id, daily_wage=daily_wage, 
                         hourly_wage=hourly_wage, insurance_deduction=insurance_deduction)
            db.session.add(emp)
            db.session.flush()
        else:
            emp.daily_wage = daily_wage
            emp.hourly_wage = hourly_wage
            emp.insurance_deduction = insurance_deduction
        
        # Save or update attendance
        att_date = datetime.strptime(entry_date, '%Y-%m-%d').date()
        att = Attendance.query.filter_by(employee_id=emp.id, date=att_date).first()
        if att:
            att.arrival_time = arrival_time
            att.departure_time = departure_time
            att.hours_worked = hours_worked
            att.is_absent = is_absent
            att.late_minutes = late_minutes
        else:
            att = Attendance(employee_id=emp.id, date=att_date, arrival_time=arrival_time, departure_time=departure_time, 
                           hours_worked=hours_worked, is_absent=is_absent, late_minutes=late_minutes)
            db.session.add(att)
        
        db.session.commit()
        return redirect(url_for('manual_entry'))
    
    return render_template('manual_entry.html', branches=branches)


@app.route('/')
@login_required
def index():
    branches = Branch.query.all()
    user = User.query.get(session['user_id'])
    branches = get_user_branches(user)
    return render_template('index.html', branches=branches)


@app.route('/users', methods=['GET', 'POST'])
@login_required
@check_permission('view_users')
def users():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if username and password:
            # check if user already exists
            if User.query.filter_by(username=username).first():
                return render_template('users.html', users=User.query.all(), error='المستخدم موجود بالفعل')
            u = User(username=username, password=password, is_admin=False)
            db.session.add(u)
            db.session.commit()
            return redirect(url_for('users'))
        return render_template('users.html', users=User.query.all(), error='البيانات غير كاملة')
    all_users = User.query.all()
    return render_template('users.html', users=all_users)


@app.route('/user/<int:user_id>/delete', methods=['POST'])
@login_required
@check_permission('view_users')
def delete_user(user_id):
    u = User.query.get_or_404(user_id)
    # prevent deleting the last admin
    if u.is_admin and User.query.filter_by(is_admin=True).count() <= 1:
        return redirect(url_for('users'))
    db.session.delete(u)
    db.session.commit()
    return redirect(url_for('users'))


@app.route('/user/<int:user_id>/permissions', methods=['GET', 'POST'])
@login_required
@check_permission('view_users')
def user_permissions(user_id):
    u = User.query.get_or_404(user_id)
    # only admin can change permissions
    current_user = User.query.get(session['user_id'])
    if not current_user.is_admin:
        return redirect(url_for('users'))
    
    # List of all available permissions
    all_perms = [
        'view_manual_entry',
        'view_branches',
        'view_daily_report',
        'view_payroll',
        'view_users',
        'manage_attendance',
        'manage_employees',
        'manage_advances',
        'print_receipts',
        'delete_branch'
    ]
    
    if request.method == 'POST':
        selected_perms = request.form.getlist('permissions')
        selected_branches = request.form.getlist('branch_ids')
        u.permissions = ','.join(selected_perms)
        u.branch_ids = ','.join(selected_branches)
        db.session.commit()
        return redirect(url_for('users'))
    
    user_perms = u.permissions.split(',') if u.permissions else []
    user_branch_ids = u.branch_ids.split(',') if u.branch_ids else []
    all_branches = Branch.query.all()
    return render_template('user_permissions.html', user=u, all_perms=all_perms, user_perms=user_perms, all_branches=all_branches, user_branch_ids=user_branch_ids)


@app.route('/branches', methods=['GET', 'POST'])
@login_required
@check_permission('view_branches')
def branches():
    user = User.query.get(session['user_id'])
    if request.method == 'POST':
        name = request.form.get('name')
        if name:
            b = Branch(name=name)
            db.session.add(b)
            db.session.commit()
        return redirect(url_for('branches'))
    # Get only branches the user has access to
    user_branches = get_user_branches(user)
    return render_template('branches.html', branches=user_branches)


@app.route('/branch/<int:branch_id>/delete', methods=['POST'])
@login_required
@check_permission('delete_branch')
def delete_branch(branch_id):
    b = Branch.query.get_or_404(branch_id)
    user = User.query.get(session['user_id'])
    if not user.is_admin and str(b.id) not in (user.branch_ids or '').split(','):
        return redirect(url_for('branches'))
    # Delete related employees and their data
    employees = Employee.query.filter_by(branch_id=b.id).all()
    for emp in employees:
        Attendance.query.filter_by(employee_id=emp.id).delete()
        Advance.query.filter_by(employee_id=emp.id).delete()
    Employee.query.filter_by(branch_id=b.id).delete()
    db.session.delete(b)
    db.session.commit()
    return redirect(url_for('branches'))


@app.route('/branch/create-with-employees', methods=['GET', 'POST'])
@login_required
@check_permission('view_branches')
def create_branch_with_employees():
    if request.method == 'POST':
        branch_name = request.form.get('branch_name')
        if not branch_name:
            return redirect(url_for('branches'))

        # create branch
        b = Branch(name=branch_name)
        db.session.add(b)
        db.session.flush()

        # read employee lists
        names = request.form.getlist('employee_name[]')
        dailies = request.form.getlist('daily_wage[]')
        hours = request.form.getlist('hourly_wage[]')
        insurances = request.form.getlist('insurance_deduction[]')

        for i, n in enumerate(names):
            if not n or not n.strip():
                continue
            try:
                daily = float(dailies[i]) if i < len(dailies) and dailies[i] else 0.0
            except:
                daily = 0.0
            try:
                hourly = float(hours[i]) if i < len(hours) and hours[i] else 0.0
            except:
                hourly = 0.0
            try:
                insurance = float(insurances[i]) if i < len(insurances) and insurances[i] else 0.0
            except:
                insurance = 0.0
            e = Employee(name=n.strip(), branch_id=b.id, daily_wage=daily, hourly_wage=hourly, 
                        insurance_deduction=insurance)
            db.session.add(e)

        db.session.commit()
        return redirect(url_for('branches'))

    return render_template('create_branch_with_employees.html')


@app.route('/branch/<int:branch_id>/employees', methods=['GET', 'POST'])
@login_required
@check_permission('manage_employees')
def employees(branch_id):
    branch = Branch.query.get_or_404(branch_id)
    user = User.query.get(session['user_id'])
    if not user.is_admin and str(branch.id) not in (user.branch_ids or '').split(','):
        return redirect(url_for('branches'))
    if request.method == 'POST':
        name = request.form.get('name')
        daily = float(request.form.get('daily_wage') or 0)
        hourly = float(request.form.get('hourly_wage') or 0)
        insurance = float(request.form.get('insurance_deduction') or 0)
        e = Employee(name=name, branch_id=branch.id, daily_wage=daily, hourly_wage=hourly, 
                    insurance_deduction=insurance)
        db.session.add(e)
        db.session.commit()
        return redirect(url_for('employees', branch_id=branch.id))
    return render_template('employees.html', branch=branch)


@app.route('/employee/<int:employee_id>/delete', methods=['POST'])
@login_required
@check_permission('manage_employees')
def delete_employee(employee_id):
    e = Employee.query.get_or_404(employee_id)
    branch_id = e.branch_id
    # Delete related records
    Attendance.query.filter_by(employee_id=e.id).delete()
    Advance.query.filter_by(employee_id=e.id).delete()
    db.session.delete(e)
    db.session.commit()
    return redirect(url_for('employees', branch_id=branch_id))


@app.route('/branch/<int:branch_id>/attendance', methods=['GET', 'POST'])
@login_required
@check_permission('manage_attendance')
def branch_attendance(branch_id):
    branch = Branch.query.get_or_404(branch_id)
    user = User.query.get(session['user_id'])
    if not user.is_admin and str(branch.id) not in (user.branch_ids or '').split(','):
        return redirect(url_for('branches'))
    if request.method == 'POST':
        att_date_str = request.form.get('attendance_date')
        att_date = datetime.strptime(att_date_str, '%Y-%m-%d').date()
        
        # Process attendance for each employee
        for emp in branch.employees:
            is_absent = request.form.get(f'absent_{emp.id}') == 'on'
            arrival_time = request.form.get(f'arrival_{emp.id}')
            departure_time = request.form.get(f'departure_{emp.id}')
            late_minutes = int(request.form.get(f'late_minutes_{emp.id}') or 0)
            
            # Calculate hours from times
            hours_worked = 0
            if arrival_time and departure_time and not is_absent:
                try:
                    arr = datetime.strptime(arrival_time, '%H:%M')
                    dep = datetime.strptime(departure_time, '%H:%M')
                    hours_worked = (dep - arr).total_seconds() / 3600
                    if hours_worked < 0:
                        hours_worked += 24
                except:
                    hours_worked = float(request.form.get(f'hours_{emp.id}') or 0)
            else:
                hours_worked = float(request.form.get(f'hours_{emp.id}') or 0)
            
            # Check if record already exists
            existing = Attendance.query.filter_by(employee_id=emp.id, date=att_date).first()
            if existing:
                existing.arrival_time = arrival_time
                existing.departure_time = departure_time
                existing.hours_worked = hours_worked
                existing.is_absent = is_absent
                existing.late_minutes = late_minutes
            else:
                if is_absent or hours_worked > 0 or late_minutes > 0 or arrival_time or departure_time:
                    a = Attendance(employee_id=emp.id, date=att_date, arrival_time=arrival_time, 
                                 departure_time=departure_time, hours_worked=hours_worked, 
                                 is_absent=is_absent, late_minutes=late_minutes)
                    db.session.add(a)
        db.session.commit()
        return redirect(url_for('branch_attendance', branch_id=branch_id))
    
    # Get today's date or from query param
    today = date.today()
    att_date_str = request.args.get('date', today.isoformat())
    att_date = datetime.strptime(att_date_str, '%Y-%m-%d').date()
    
    # Get existing attendance for this date
    attendance_dict = {}
    for emp in branch.employees:
        att = Attendance.query.filter_by(employee_id=emp.id, date=att_date).first()
        attendance_dict[emp.id] = att
    
    return render_template('branch_attendance.html', branch=branch, attendance_date=att_date, attendance_dict=attendance_dict)


@app.route('/employee/<int:employee_id>/attendance', methods=['GET', 'POST'])
@login_required
@check_permission('manage_attendance')
def attendance(employee_id):
    e = Employee.query.get_or_404(employee_id)
    if request.method == 'POST':
        d = request.form.get('date')
        arrival_time = request.form.get('arrival_time')
        departure_time = request.form.get('departure_time')
        is_absent = True if request.form.get('is_absent') == 'on' else False
        late_minutes = int(request.form.get('late_minutes') or 0)
        
        # Calculate hours from times
        hours_worked = 0
        if arrival_time and departure_time and not is_absent:
            try:
                arr = datetime.strptime(arrival_time, '%H:%M')
                dep = datetime.strptime(departure_time, '%H:%M')
                hours_worked = (dep - arr).total_seconds() / 3600
                if hours_worked < 0:
                    hours_worked += 24
            except:
                hours_worked = float(request.form.get('hours') or 0)
        else:
            hours_worked = float(request.form.get('hours') or 0)
        
        att_date = datetime.strptime(d, '%Y-%m-%d').date()
        a = Attendance(employee_id=e.id, date=att_date, arrival_time=arrival_time, 
                     departure_time=departure_time, hours_worked=hours_worked, 
                     is_absent=is_absent, late_minutes=late_minutes)
        db.session.add(a)
        db.session.commit()
        return redirect(url_for('attendance', employee_id=e.id))
    atts = Attendance.query.filter_by(employee_id=e.id).order_by(Attendance.date.desc()).all()
    return render_template('attendance.html', employee=e, attendances=atts)


@app.route('/employee/<int:employee_id>/advances', methods=['GET', 'POST'])
@login_required
@check_permission('manage_advances')
def advances(employee_id):
    e = Employee.query.get_or_404(employee_id)
    if request.method == 'POST':
        amount = float(request.form.get('amount') or 0)
        months = int(request.form.get('months') or 1)
        adv = Advance(employee_id=e.id, amount=amount, months=months)
        db.session.add(adv)
        db.session.commit()
        return redirect(url_for('advances', employee_id=e.id))
    advs = Advance.query.filter_by(employee_id=e.id).order_by(Advance.created_at.desc()).all()
    return render_template('advances.html', employee=e, advances=advs)


@app.route('/employee/<int:employee_id>/withdrawals', methods=['GET', 'POST'])
@login_required
@check_permission('manage_advances')
def withdrawals(employee_id):
    e = Employee.query.get_or_404(employee_id)
    if request.method == 'POST':
        amount = float(request.form.get('amount') or 0)
        withdrawal_date_str = request.form.get('withdrawal_date')
        withdrawal_date = datetime.strptime(withdrawal_date_str, '%Y-%m-%d').date()
        withdrawal = Withdrawal(employee_id=e.id, amount=amount, withdrawal_date=withdrawal_date)
        db.session.add(withdrawal)
        db.session.commit()
        return redirect(url_for('withdrawals', employee_id=e.id))
    
    withdrawals_list = Withdrawal.query.filter_by(employee_id=e.id).order_by(Withdrawal.withdrawal_date.desc()).all()
    return render_template('withdrawals.html', employee=e, withdrawals=withdrawals_list)


@app.route('/daily-report', methods=['GET'])
@login_required
@check_permission('view_daily_report')
def daily_report():
    branches = Branch.query.all()
    user = User.query.get(session['user_id'])
    branches = get_user_branches(user)
    month = int(request.args.get('month') or datetime.utcnow().month)
    year = int(request.args.get('year') or datetime.utcnow().year)
    branch_id = request.args.get('branch_id')
    
    if branch_id:
        branch = Branch.query.get_or_404(int(branch_id))
        employees = Employee.query.filter_by(branch_id=branch.id).all()
    else:
        branch = None
        employees = Employee.query.all()
    
    # Generate 30 days of data
    from calendar import monthrange
    days_in_month = monthrange(year, month)[1]
    
    daily_data = []
    for day in range(1, min(31, days_in_month + 1)):
        current_date = date(year, month, day)
        
        day_totals = {
            'date': current_date,
            'day_name': ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'][current_date.weekday()],
            'present': 0,
            'absent': 0,
            'total_hours': 0.0,
            'total_overtime': 0.0,
            'total_employees': len(employees),
            'employees_data': []
        }
        
        for emp in employees:
            att = Attendance.query.filter_by(employee_id=emp.id, date=current_date).first()
            if att:
                if att.is_absent:
                    day_totals['absent'] += 1
                else:
                    day_totals['present'] += 1
                    day_totals['total_hours'] += att.hours_worked
                    if att.hours_worked > 9:
                        day_totals['total_overtime'] += (att.hours_worked - 9)
                
                day_totals['employees_data'].append({
                    'name': emp.name,
                    'hours': att.hours_worked,
                    'arrival': att.arrival_time or '-',
                    'departure': att.departure_time or '-',
                    'late_minutes': att.late_minutes,
                    'is_absent': att.is_absent
                })
        
        daily_data.append(day_totals)
    
    return render_template('daily_report.html', daily_data=daily_data, branches=branches, 
                         month=month, year=year, branch=branch)


@app.route('/payroll', methods=['GET'])
@login_required
@check_permission('view_payroll')
def payroll():
    month = int(request.args.get('month') or datetime.utcnow().month)
    year = int(request.args.get('year') or datetime.utcnow().year)
    branch_id = request.args.get('branch_id')
    if branch_id:
        branch = Branch.query.get_or_404(int(branch_id))
        employees = Employee.query.filter_by(branch_id=branch.id).all()
    else:
        branch = None
        employees = Employee.query.all()

    results = []
    total_net = 0.0
    total_gross = 0.0
    total_withdrawal_10 = 0.0
    total_withdrawal_20 = 0.0
    
    for emp in employees:
        # Compute pay for first half (day 1-10)
        first_half_date = date(year, month, 10)
        r1 = compute_pay_for_employee(emp, month, year, withdrawal_date=first_half_date)
        
        # Compute pay for second half (day 11-end of month)
        from calendar import monthrange
        last_day = monthrange(year, month)[1]
        r2_date = date(year, month, min(20, last_day))
        r2 = compute_pay_for_employee(emp, month, year, withdrawal_date=r2_date)
        
        # Calculate withdrawal amounts
        withdrawal_10 = r1['net']
        withdrawal_20 = r2['net'] - r1['net']
        
        results.append({
            'employee': emp,
            'base_pay': r2['base_pay'],
            'overtime_pay': r2['overtime_pay'],
            'total_deductions': r2['total_deductions'],
            'net': r2['net'],
            'total_hours': r2['total_hours'],
            'overtime_hours': r2['overtime_hours'],
            'withdrawal_10': withdrawal_10,
            'withdrawal_20': withdrawal_20
        })
        
        total_net += r2['net']
        total_gross += r2['gross']
        total_withdrawal_10 += withdrawal_10
        total_withdrawal_20 += withdrawal_20

    # if export csv requested
    if request.args.get('export') == 'csv':
        si = io.StringIO()
        cw = csv.writer(si)
        cw.writerow(['اسم الموظف', 'الأساسي', 'إضافي', 'الخصومات', 'الصافي', 'سحب يوم 10', 'سحب يوم 20'])
        for r in results:
            cw.writerow([r['employee'].name, r['base_pay'], r['overtime_pay'], r['total_deductions'], r['net'], r['withdrawal_10'], r['withdrawal_20']])
        output = make_csv_response(si.getvalue(), f'payroll_{month}_{year}.csv')
        return output

    return render_template('payroll.html', results=results, month=month, year=year, branch=branch, total_net=total_net, total_gross=total_gross, total_withdrawal_10=total_withdrawal_10, total_withdrawal_20=total_withdrawal_20)


@app.route('/receipt/<int:employee_id>/<int:month>/<int:year>', methods=['GET'])
@login_required
def receipt(employee_id, month, year):
    emp = Employee.query.get_or_404(employee_id)
    branch = Branch.query.get(emp.branch_id)
    
    # Calculate pay
    r = compute_pay_for_employee(emp, month, year)
    
    # Calculate withdrawals
    first_half_date = date(year, month, 10)
    r1 = compute_pay_for_employee(emp, month, year, withdrawal_date=first_half_date)
    withdrawal_10 = r1['net']
    withdrawal_20 = r['net'] - r1['net']
    
    from calendar import monthrange
    last_day = monthrange(year, month)[1]
    
    return render_template('receipt.html',
                         employee_name=emp.name,
                         employee_id=emp.id,
                         branch_name=branch.name if branch else 'بدون فرع',
                         month=month,
                         year=year,
                         base_pay=r['base_pay'],
                         overtime_pay=r['overtime_pay'],
                         gross=r['gross'],
                         absence_deduction=r['total_deductions'] * (r['absence_days'] * emp.daily_wage / r['total_deductions']) if r['total_deductions'] > 0 else 0,
                         late_deduction=r['late_deduction'],
                         short_hours_deduction=r['short_hours_deduction'],
                         monthly_adv_repayment=r['monthly_adv_repayment'],
                         total_deductions=r['total_deductions'],
                         net=r['net'],
                         withdrawal_10=withdrawal_10,
                         withdrawal_20=withdrawal_20,
                         days_present=r['days_present'],
                         absence_days=r['absence_days'],
                         total_hours=r['total_hours'],
                         overtime_hours=r['overtime_hours'],
                         receipt_date=datetime.now().strftime('%d/%m/%Y'),
                         receipt_number=f"{emp.id}{month}{year}",
                         current_date=datetime.now().strftime('%d/%m/%Y %H:%M'))


@app.route('/branch/<int:branch_id>/receipts/<int:month>/<int:year>')
@login_required
@check_permission('print_receipts')
def branch_receipts(branch_id, month, year):
    branch = Branch.query.get_or_404(branch_id)
    user = User.query.get(session['user_id'])
    if not user.is_admin and str(branch.id) not in (user.branch_ids or '').split(','):
        return redirect(url_for('branches'))
    employees = Employee.query.filter_by(branch_id=branch.id).all()
    receipts = []
    from calendar import monthrange
    last_day = monthrange(year, month)[1]

    for emp in employees:
        r = compute_pay_for_employee(emp, month, year)
        first_half_date = date(year, month, 10)
        r1 = compute_pay_for_employee(emp, month, year, withdrawal_date=first_half_date)
        withdrawal_10 = r1['net']
        withdrawal_20 = r['net'] - r1['net']

        absence_deduction = r['absence_days'] * emp.daily_wage

        receipts.append({
            'employee_id': emp.id,
            'employee_name': emp.name,
            'branch_name': branch.name,
            'month': month,
            'year': year,
            'base_pay': r['base_pay'],
            'overtime_pay': r['overtime_pay'],
            'gross': r['gross'],
            'absence_deduction': absence_deduction,
            'late_deduction': r['late_deduction'],
            'short_hours_deduction': r['short_hours_deduction'],
            'monthly_adv_repayment': r['monthly_adv_repayment'],
            'total_deductions': r['total_deductions'],
            'net': r['net'],
            'withdrawal_10': withdrawal_10,
            'withdrawal_20': withdrawal_20,
            'days_present': r['days_present'],
            'absence_days': r['absence_days'],
            'total_hours': r['total_hours'],
            'overtime_hours': r['overtime_hours'],
            'receipt_date': datetime.now().strftime('%d/%m/%Y'),
            'receipt_number': f"{emp.id}{month}{year}",
            'current_date': datetime.now().strftime('%d/%m/%Y %H:%M')
        })

    return render_template('branch_receipts.html', receipts=receipts, branch=branch, month=month, year=year)


@app.route('/branch/<int:branch_id>/receipts-sheet/<int:month>/<int:year>')
@login_required
@check_permission('print_receipts')
def branch_receipts_sheet(branch_id, month, year):
    user = User.query.get(session['user_id'])
    branch = Branch.query.get_or_404(branch_id)
    if not user.is_admin and str(branch.id) not in (user.branch_ids or '').split(','):
        return redirect(url_for('branches'))
    # per_page from querystring (default 4)
    try:
        per_page = int(request.args.get('per_page') or 4)
    except:
        per_page = 4
    if per_page < 1:
        per_page = 1

    branch = Branch.query.get_or_404(branch_id)
    employees = Employee.query.filter_by(branch_id=branch.id).all()
    receipts = []
    from calendar import monthrange

    for emp in employees:
        r = compute_pay_for_employee(emp, month, year)
        first_half_date = date(year, month, 10)
        r1 = compute_pay_for_employee(emp, month, year, withdrawal_date=first_half_date)
        withdrawal_10 = r1['net']
        withdrawal_20 = r['net'] - r1['net']

        receipts.append({
            'employee_name': emp.name,
            'branch_name': branch.name,
            'month': month,
            'year': year,
            'base_pay': r['base_pay'],
            'overtime_pay': r['overtime_pay'],
            'total_deductions': r['total_deductions'],
            'net': r['net'],
        })

    # calculate card width based on per_page
    # simple mapping: 1->100%,2->48%,4->23%,6->15%,8->11%
    widths = {1: '100%', 2: '48%', 4: '23%', 6: '15%', 8: '11%'}
    card_width = widths.get(per_page, f'{int(100/per_page)-2}%')

    return render_template('branch_receipts_sheet.html', receipts=receipts, branch=branch, month=month, year=year, per_page=per_page, card_width=card_width)


def make_csv_response(csv_text, filename):
    return Response(
        csv_text,
        mimetype='text/csv',
        headers={"Content-disposition": f"attachment; filename={filename}"}
    )


if __name__ == '__main__':
    with app.app_context():
        init_db()
    app.run(host='192.168.1.24', debug=True)
