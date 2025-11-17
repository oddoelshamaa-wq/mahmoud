    // Data structures and storage
    let employees = JSON.parse(localStorage.getItem('employees')) || [];
    let attendance = {}; // Now: attendance[employeeName][month][day] = {attendance, departure}
    let currentYear = new Date().getFullYear();
    let selectedEmployeeForAttendance = '';

    // Helper function to get attendance key for the selected month and employee
    function getAttendanceKey(employeeName) {
        const month = document.getElementById('monthSelect').value;
        return `attendance-${employeeName}-${currentYear}-${month}`;
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
        const currentMonth = new Date().getMonth() + 1;
        document.getElementById('monthSelect').value = currentMonth;
        loadAttendanceForMonth();
        updateAttendanceTable();
        displayEmployees();
        calculate();
        populateEmployeeSelect();
        populateAttendanceEmployeeSelect();

        // Add event listener for month change
        document.getElementById('monthSelect').addEventListener('change', function() {
            loadAttendanceForMonth();
            updateAttendanceTable();
            calculate();
        });
    });

    // Load attendance data for the selected month
    function loadAttendanceForMonth() {
        if (selectedEmployeeForAttendance) {
            attendance = JSON.parse(localStorage.getItem(getAttendanceKey(selectedEmployeeForAttendance))) || {};
        } else {
            attendance = {};
        }
    }

    // Save data to localStorage
    function saveData() {
        localStorage.setItem('employees', JSON.stringify(employees));
        if (selectedEmployeeForAttendance) {
            localStorage.setItem(getAttendanceKey(selectedEmployeeForAttendance), JSON.stringify(attendance));
        }
    }

    // Update attendance table for the month
    function updateAttendanceTable() {
        const month = parseInt(document.getElementById('monthSelect').value);
        const table = document.getElementById('attendanceTable');
        const tbody = table.querySelector('tbody') || document.createElement('tbody');
        tbody.innerHTML = '';

        const daysInMonth = new Date(currentYear, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = day;

            const attendanceCell = row.insertCell(1);
            const departureCell = row.insertCell(2);

            const attendanceInput = document.createElement('input');
            attendanceInput.type = 'time';
            attendanceInput.id = `attendance-${day}`;
            attendanceInput.value = attendance[day]?.attendance || '';
            attendanceInput.addEventListener('change', () => updateAttendance(day, 'attendance', attendanceInput.value));
            attendanceCell.appendChild(attendanceInput);

            const departureInput = document.createElement('input');
            departureInput.type = 'time';
            departureInput.id = `departure-${day}`;
            departureInput.value = attendance[day]?.departure || '';
            departureInput.addEventListener('change', () => updateAttendance(day, 'departure', departureInput.value));
            departureCell.appendChild(departureInput);
        }

        if (!table.querySelector('tbody')) {
            table.appendChild(tbody);
        }
    }

    // Update attendance data
    function updateAttendance(day, type, value) {
        if (!attendance[day]) attendance[day] = {};
        attendance[day][type] = value;
        saveData();
        calculate(); // Recalculate when attendance changes
    }

    // Filter employees by branch
    function filterEmployees() {
        displayEmployees();
        populateEmployeeSelect(); // Update employee select when branch filter changes
        populateAttendanceEmployeeSelect(); // Update attendance employee select when branch filter changes
    }

    // Display employees in table
    function displayEmployees() {
        const table = document.getElementById('employeeTable').querySelector('tbody');
        table.innerHTML = '';

        const branchFilter = document.getElementById('branchSelect').value;
        const filteredEmployees = branchFilter ? employees.filter(emp => emp.branch === branchFilter) : employees;

        filteredEmployees.forEach((emp, index) => {
            const row = table.insertRow();
            row.insertCell(0).textContent = emp.name;
            row.insertCell(1).textContent = emp.job;

        const actionsCell = row.insertCell(2);
        const editBtn = document.createElement('button');
        editBtn.textContent = 'تعديل';
        editBtn.onclick = () => editEmployee(index);
        actionsCell.appendChild(editBtn);

        const reduceBtn = document.createElement('button');
        reduceBtn.textContent = 'تقليل المدة';
        reduceBtn.onclick = () => reduceLoanMonths(index);
        actionsCell.appendChild(reduceBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'حذف';
        deleteBtn.onclick = () => deleteEmployee(index);
        actionsCell.appendChild(deleteBtn);
        });
    }

    // Save or update employee
    function saveEmployee() {
        const name = document.getElementById('name').value.trim();
        const job = document.getElementById('job').value.trim();
        const branch = document.getElementById('branchSelect').value;
        const hourPrice = parseFloat(document.getElementById('hourPrice').value) || 0;
        const dailyWage = parseFloat(document.getElementById('dailyWage').value) || 0;
        const extraDeduction = parseFloat(document.getElementById('extraDeduction').value) || 0;
        const insuranceDeduction = parseFloat(document.getElementById('insuranceDeduction').value) || 0;
        const loansDeduction = parseFloat(document.getElementById('loansDeduction').value) || 0;
        const loansMonths = parseInt(document.getElementById('loansMonths').value) || 1;

        const additional = parseFloat(document.getElementById('additional').value) || 0;
        const deduction10 = parseFloat(document.getElementById('deduction10').value) || 10;
        const deductionDay20 = parseFloat(document.getElementById('deductionDay20').value) || 20;

        if (!name || !job || !branch) {
            alert('يرجى ملء جميع الحقول المطلوبة');
            return;
        }

        const employee = {
            name, job, branch, hourPrice, dailyWage, extraDeduction,
            insuranceDeduction, loansDeduction, loansMonths, additional, deduction10, deductionDay20, loanMonthsPaid: 0
        };

        // Check if editing existing employee
        const existingIndex = employees.findIndex(emp => emp.name === name && emp.branch === branch);
        if (existingIndex !== -1) {
            // Check if loansDeduction has changed
            const oldLoansDeduction = employees[existingIndex].loansDeduction || 0;
            if (loansDeduction !== oldLoansDeduction) {
                // Reset loan if deduction amount changed
                employee.loanRemaining = loansDeduction;
                employee.loanMonthsPaid = 0;
            } else {
                // Preserve loanRemaining and loanMonthsPaid if deduction unchanged
                if (employees[existingIndex].loanRemaining !== undefined) {
                    employee.loanRemaining = employees[existingIndex].loanRemaining;
                }
                if (employees[existingIndex].loanMonthsPaid !== undefined) {
                    employee.loanMonthsPaid = employees[existingIndex].loanMonthsPaid;
                }
            }

            employees[existingIndex] = employee;
        } else {
            employees.push(employee);
        }

        // Set loanRemaining if new loan (for new employees)
        const empIndex = existingIndex !== -1 ? existingIndex : employees.length - 1;
        if (loansDeduction > 0 && employees[empIndex].loanRemaining === undefined) {
            employees[empIndex].loanRemaining = loansDeduction;
        }
        saveData();
        displayEmployees();
        clearForm();
        calculate(); // Recalculate after saving employee
        populateEmployeeSelect(); // Update employee select dropdown
    }

    // Edit employee
    function editEmployee(index) {
        const emp = employees[index];
        document.getElementById('name').value = emp.name;
        document.getElementById('job').value = emp.job;
        document.getElementById('branchSelect').value = emp.branch;
        document.getElementById('hourPrice').value = emp.hourPrice;
        document.getElementById('dailyWage').value = emp.dailyWage;
        document.getElementById('extraDeduction').value = emp.extraDeduction;
        document.getElementById('insuranceDeduction').value = emp.insuranceDeduction;
        document.getElementById('loansDeduction').value = emp.loansDeduction;
        document.getElementById('loansMonths').value = emp.loansMonths;

        document.getElementById('additional').value = emp.additional;
        document.getElementById('deduction10').value = emp.deduction10 || 10;
        document.getElementById('deductionDay20').value = emp.deductionDay20 || 20;
    }

// Delete employee
function deleteEmployee(index) {
    if (confirm('هل أنت متأكد من حذف هذا الموظف؟')) {
        employees.splice(index, 1);
    saveData();
    displayEmployees();
    calculate(); // Recalculate after deleting employee
    populateEmployeeSelect(); // Update employee select dropdown
    }
}

// Reduce loan months
function reduceLoanMonths(index) {
    const emp = employees[index];
    const newMonths = prompt(`أدخل المدة الجديدة للسلفة للموظف ${emp.name} (الحالية: ${emp.loansMonths})`);
    if (newMonths !== null && newMonths !== '') {
        const months = parseInt(newMonths);
        if (months > 0 && months < emp.loansMonths) {
            emp.loansMonths = months;
            saveData();
            displayEmployees();
            calculate();
        } else {
            alert('المدة يجب أن تكون أقل من المدة الحالية وأكبر من صفر');
        }
    }
}

    // Clear form
    function clearForm() {
        document.getElementById('name').value = '';
        document.getElementById('job').value = '';
        document.getElementById('hourPrice').value = '';
        document.getElementById('dailyWage').value = '';
        document.getElementById('extraDeduction').value = '';
        document.getElementById('insuranceDeduction').value = '';
        document.getElementById('loansDeduction').value = '';
        document.getElementById('loansMonths').value = '';

        document.getElementById('additional').value = '';
        document.getElementById('deduction10').value = '10';
        document.getElementById('deductionDay20').value = '20';
    }

    // Populate employee select dropdown based on selected branch
    function populateEmployeeSelect() {
        const select = document.getElementById('employeeSelect');
        const branchFilter = document.getElementById('branchSelect').value;
        select.innerHTML = '<option value="">جميع الموظفين</option>';

        const filteredEmployees = branchFilter ? employees.filter(emp => emp.branch === branchFilter) : employees;
        filteredEmployees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.name;
            option.textContent = emp.name;
            select.appendChild(option);
        });
    }

    // Filter pay sheet by selected employee
    function filterPaySheet() {
        const selectedEmployee = document.getElementById('employeeSelect').value;
        const paySheetTable = document.getElementById('paySheetTable').querySelector('tbody');
        const rows = paySheetTable.querySelectorAll('tr');

        rows.forEach(row => {
            const nameCell = row.cells[0];
            if (nameCell) {
                const name = nameCell.textContent;
                if (selectedEmployee === '' || name === selectedEmployee) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            }
        });
    }

    // Populate attendance employee select dropdown
    function populateAttendanceEmployeeSelect() {
        const select = document.getElementById('attendanceEmployeeSelect');
        select.innerHTML = '<option value="">-- اختر موظف --</option>';

        const branchFilter = document.getElementById('branchSelect').value;
        const filteredEmployees = branchFilter ? employees.filter(emp => emp.branch === branchFilter) : employees;

        filteredEmployees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.name;
            option.textContent = emp.name;
            select.appendChild(option);
        });
    }

    // Select employee for attendance editing
    function selectEmployeeForAttendance() {
        selectedEmployeeForAttendance = document.getElementById('attendanceEmployeeSelect').value;
        loadAttendanceForMonth();
        updateAttendanceTable();
    }

    // Calculate wages and display results
    function calculate() {
        const paySheetTable = document.getElementById('paySheetTable').querySelector('tbody');
        paySheetTable.innerHTML = '';

        const branchTotals = {};
        const dailyTotals = {};
        const monthlyReview = {};

        // Initialize totals for pay sheet
        let totalDaysWorked = 0;
        let totalOvertimeHours = 0;
        let totalDelayHours = 0;
        let totalAbsenceDays = 0;
        let totalBasicWage = 0;
        let totalAdditional = 0;
        let totalDelayDeduction = 0;
        let totalAbsenceDeduction = 0;
        let totalLoansDeduction = 0;
        let totalInsuranceDeduction = 0;
        let totalExtraDeduction = 0;

        let totalDeduction10 = 0;
        let totalDeductionDay20 = 0;
        let totalDailySalary = 0;
        let totalNetSalary = 0;

        // Assign employee counters per branch
        const branchCounters = {};
        employees.forEach(emp => {
            if (!branchCounters[emp.branch]) branchCounters[emp.branch] = 1;
            emp.employeeCounter = branchCounters[emp.branch]++;
        });

        employees.forEach(emp => {
            const { name, branch, hourPrice, dailyWage, extraDeduction, insuranceDeduction, loansDeduction, loansMonths, additional, deduction10 = 10, deductionDay20 = 20 } = emp;


            // Load attendance for this employee
            const empAttendance = JSON.parse(localStorage.getItem(getAttendanceKey(name))) || {};

            // Calculate attendance-based metrics
            let empDaysWorked = 0;
            let empOvertimeHours = 0;
            let empDelayHours = 0;
            let empAbsenceDays = 0;

            const currentMonth = parseInt(document.getElementById('monthSelect').value);
            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const dayAttendance = empAttendance[day];
                if (dayAttendance && dayAttendance.attendance && dayAttendance.departure) {
                    empDaysWorked++;
                    const attendanceTime = new Date(`2000-01-01T${dayAttendance.attendance}`);
                    const departureTime = new Date(`2000-01-01T${dayAttendance.departure}`);
                    const hoursWorked = (departureTime - attendanceTime) / (1000 * 60 * 60);

                    if (hoursWorked > 9) {
                        empOvertimeHours += hoursWorked - 9;
                    } else if (hoursWorked < 9) {
                        empDelayHours += 9 - hoursWorked;
                    }
                } else {
                    empAbsenceDays++;
                }
            }

            // Calculate wages
            const basicWage = dailyWage * empDaysWorked + hourPrice * empOvertimeHours;
            const overtimePay = hourPrice * empOvertimeHours;
            const delayDeduction = hourPrice * empDelayHours;
            const absenceDeduction = dailyWage * empAbsenceDays;

            // Conditional deduction for day 10
            let deduction10Amount = 0;
            const day10Attendance = empAttendance[10];
            if (!day10Attendance || !day10Attendance.attendance || !day10Attendance.departure) {
                deduction10Amount = deduction10;
            }

            // Conditional deduction for day 20
            let deductionDay20Amount = 0;
            const day20Attendance = empAttendance[20];
            if (!day20Attendance || !day20Attendance.attendance || !day20Attendance.departure) {
                deductionDay20Amount = deductionDay20;
            }

            // Automatic loan deduction
            let loansMonthlyDeduction = 0;
            if (emp.loanRemaining > 0 && emp.loanMonthsPaid < loansMonths) {
                loansMonthlyDeduction = Math.min(emp.loanRemaining, loansDeduction / loansMonths);
                emp.loanRemaining -= loansMonthlyDeduction;
                emp.loanMonthsPaid += 1;
            } else if (loansDeduction > 0 && emp.loanRemaining === undefined) {
                emp.loanRemaining = loansDeduction;
                loansMonthlyDeduction = Math.min(emp.loanRemaining, loansDeduction / loansMonths);
                emp.loanRemaining -= loansMonthlyDeduction;
                emp.loanMonthsPaid = 1;
            }

            const netSalary = basicWage + additional - delayDeduction - absenceDeduction - loansMonthlyDeduction - insuranceDeduction - extraDeduction - deduction10Amount - deductionDay20Amount;
            const dailySalary = netSalary / daysInMonth;

            // Employee counter is already assigned above

            // Add to pay sheet
            const row = paySheetTable.insertRow();
            row.insertCell(0).textContent = name;
            const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
            row.insertCell(1).textContent = monthNames[currentMonth - 1];
            row.insertCell(2).textContent = branch;
            row.insertCell(3).textContent = emp.employeeCounter;
            row.insertCell(4).textContent = empDaysWorked;
            row.insertCell(5).textContent = empOvertimeHours.toFixed(2);
            row.insertCell(6).textContent = empDelayHours.toFixed(2);
            row.insertCell(7).textContent = empAbsenceDays;
            row.insertCell(8).textContent = basicWage.toFixed(2);
            row.insertCell(9).textContent = additional.toFixed(2);
            const delayCell = row.insertCell(10);
            delayCell.textContent = delayDeduction.toFixed(2);
            if (delayDeduction > 0) delayCell.classList.add('negative');
            const absenceCell = row.insertCell(11);
            absenceCell.textContent = absenceDeduction.toFixed(2);
            if (absenceDeduction > 0) absenceCell.classList.add('negative');
            const loansCell = row.insertCell(12);
            loansCell.textContent = loansMonthlyDeduction.toFixed(2);
            if (loansMonthlyDeduction > 0) loansCell.classList.add('negative');
            const insuranceCell = row.insertCell(13);
            insuranceCell.textContent = insuranceDeduction.toFixed(2);
            if (insuranceDeduction > 0) insuranceCell.classList.add('negative');
            const extraCell = row.insertCell(14);
            extraCell.textContent = extraDeduction.toFixed(2);
            if (extraDeduction > 0) extraCell.classList.add('negative');
            const deduction10Cell = row.insertCell(15);
            deduction10Cell.textContent = deduction10.toFixed(2);
            if (deduction10 > 0) deduction10Cell.classList.add('negative');
            const deductionDay20Cell = row.insertCell(16);
            deductionDay20Cell.textContent = deductionDay20.toFixed(2);
            if (deductionDay20 > 0) deductionDay20Cell.classList.add('negative');
            row.insertCell(17).textContent = dailySalary.toFixed(2);
            const netCell = row.insertCell(18);
            netCell.textContent = netSalary.toFixed(2);
            if (netSalary < 0) netCell.classList.add('negative');

            // Accumulate totals
            totalDaysWorked += empDaysWorked;
            totalOvertimeHours += empOvertimeHours;
            totalDelayHours += empDelayHours;
            totalAbsenceDays += empAbsenceDays;
            totalBasicWage += basicWage;
            totalAdditional += additional;
            totalDelayDeduction += delayDeduction;
            totalAbsenceDeduction += absenceDeduction;
            totalLoansDeduction += loansMonthlyDeduction;
            totalInsuranceDeduction += insuranceDeduction;
            totalExtraDeduction += extraDeduction;
            totalDeduction10 += deduction10;
            totalDeductionDay20 += deductionDay20;
            totalDailySalary += dailySalary;
            totalNetSalary += netSalary;

            // Aggregate branch totals
            if (!branchTotals[branch]) {
                branchTotals[branch] = { count: 0, dailyTotal: 0, monthlyTotal: 0 };
            }
            branchTotals[branch].count++;
            branchTotals[branch].dailyTotal += dailySalary; // Sum of daily salaries
            branchTotals[branch].monthlyTotal += netSalary;

            // Aggregate daily totals (sum of daily salaries per branch per day)
            const currentDay = new Date().getDate();
            if (!dailyTotals[branch]) dailyTotals[branch] = {};
            if (!dailyTotals[branch][currentDay]) dailyTotals[branch][currentDay] = 0;
            dailyTotals[branch][currentDay] += dailySalary;

            // Monthly review
            if (!monthlyReview[branch]) monthlyReview[branch] = [];
            monthlyReview[branch].push({ name, netSalary });
        });

        // Display branch totals
        const branchTotalsTable = document.getElementById('branchTotalsTable').querySelector('tbody');
        branchTotalsTable.innerHTML = '';
        Object.keys(branchTotals).forEach(branch => {
            const row = branchTotalsTable.insertRow();
            row.insertCell(0).textContent = branch;
            row.insertCell(1).textContent = branchTotals[branch].count;
            row.insertCell(2).textContent = branchTotals[branch].dailyTotal.toFixed(2);
            row.insertCell(3).textContent = branchTotals[branch].monthlyTotal.toFixed(2);
        });

        // Display daily totals
        const dailyTotalsTable = document.getElementById('dailyTotalsTable').querySelector('tbody');
        dailyTotalsTable.innerHTML = '';
        Object.keys(dailyTotals).forEach(branch => {
            Object.keys(dailyTotals[branch]).forEach(day => {
                const row = dailyTotalsTable.insertRow();
                row.insertCell(0).textContent = branch;
                row.insertCell(1).textContent = day;
                row.insertCell(2).textContent = dailyTotals[branch][day].toFixed(2);
            });
        });

        // Add total row to pay sheet
        if (employees.length > 0) {
            const totalRow = paySheetTable.insertRow();
            totalRow.insertCell(0).textContent = 'المجموع';
            totalRow.insertCell(1).textContent = '';
            totalRow.insertCell(2).textContent = '';
            totalRow.insertCell(3).textContent = '';
            totalRow.insertCell(4).textContent = totalDaysWorked;
            totalRow.insertCell(5).textContent = totalOvertimeHours.toFixed(2);
            totalRow.insertCell(6).textContent = totalDelayHours.toFixed(2);
            totalRow.insertCell(7).textContent = totalAbsenceDays;
            totalRow.insertCell(8).textContent = totalBasicWage.toFixed(2);
            totalRow.insertCell(9).textContent = totalAdditional.toFixed(2);
            const totalDelayCell = totalRow.insertCell(10);
            totalDelayCell.textContent = totalDelayDeduction.toFixed(2);
            if (totalDelayDeduction > 0) totalDelayCell.classList.add('negative');
            const totalAbsenceCell = totalRow.insertCell(11);
            totalAbsenceCell.textContent = totalAbsenceDeduction.toFixed(2);
            if (totalAbsenceDeduction > 0) totalAbsenceCell.classList.add('negative');
            const totalLoansCell = totalRow.insertCell(12);
            totalLoansCell.textContent = (-totalLoansDeduction).toFixed(2);
            totalLoansCell.classList.add('negative');
            const totalInsuranceCell = totalRow.insertCell(13);
            totalInsuranceCell.textContent = (-totalInsuranceDeduction).toFixed(2);
            totalInsuranceCell.classList.add('negative');
            const totalExtraCell = totalRow.insertCell(14);
            totalExtraCell.textContent = (-totalExtraDeduction).toFixed(2);
            totalExtraCell.classList.add('negative');
            const totalDeduction10Cell = totalRow.insertCell(15);
            totalDeduction10Cell.textContent = (-totalDeduction10).toFixed(2);
            totalDeduction10Cell.classList.add('negative');
            const totalDeductionDay20Cell = totalRow.insertCell(16);
            totalDeductionDay20Cell.textContent = (-totalDeductionDay20).toFixed(2);
            totalDeductionDay20Cell.classList.add('negative');
            totalRow.insertCell(17).textContent = totalDailySalary.toFixed(2);
            const totalNetCell = totalRow.insertCell(18);
            totalNetCell.textContent = totalNetSalary.toFixed(2);
            if (totalNetSalary < 0) totalNetCell.classList.add('negative');
        }

        // Display monthly review
        const monthlyReviewTable = document.getElementById('monthlyReviewTable').querySelector('tbody');
        monthlyReviewTable.innerHTML = '';
    Object.keys(monthlyReview).forEach(branch => {
        monthlyReview[branch].forEach(emp => {
            const row = monthlyReviewTable.insertRow();
            row.insertCell(0).textContent = emp.name;
            row.insertCell(1).textContent = branch;
            row.insertCell(2).textContent = emp.netSalary.toFixed(2);
        });
    });

    // Save updated employees data after calculations
    saveData();
}

// Print grand totals for all employees across all branches
function printGrandTotals() {
    if (employees.length === 0) {
        alert('لا توجد بيانات لطباعة الإجماليات الكلية');
        return;
    }

    // Open a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');

    // Write the HTML content to the new window
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>الإجماليات الكلية للموظفين</title>
            <style>
                body { font-family: "Cairo", sans-serif; margin: 20px; direction: rtl; }
                h1 { text-align: center; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                th { background: #f8f9fa; font-weight: bold; }
                .total-row { background: #e9ecef; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>الإجماليات الكلية للموظفين - ${['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][parseInt(document.getElementById('monthSelect').value) - 1]} ${currentYear}</h1>
            <table>
                <thead>
                    <tr>
                        <th>الاسم</th>
                        <th>الوظيفة</th>
                        <th>الفرع</th>
                        <th>صافي المرتب</th>
                    </tr>
                </thead>
                <tbody>
    `);

    let grandTotalNetSalary = 0;

    employees.forEach(emp => {
        const { name, job, branch, hourPrice, dailyWage, extraDeduction, insuranceDeduction, loansDeduction, loansMonths, additional, deduction10 = 10, deductionDay20 = 20 } = emp;

        // Load attendance for this employee
        const empAttendance = JSON.parse(localStorage.getItem(getAttendanceKey(name))) || {};

        // Calculate attendance-based metrics
        let empDaysWorked = 0;
        let empOvertimeHours = 0;
        let empDelayHours = 0;
        let empAbsenceDays = 0;

        const currentMonth = parseInt(document.getElementById('monthSelect').value);
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const dayAttendance = empAttendance[day];
            if (dayAttendance && dayAttendance.attendance && dayAttendance.departure) {
                empDaysWorked++;
                const attendanceTime = new Date(`2000-01-01T${dayAttendance.attendance}`);
                const departureTime = new Date(`2000-01-01T${dayAttendance.departure}`);
                const hoursWorked = (departureTime - attendanceTime) / (1000 * 60 * 60);

                if (hoursWorked > 9) {
                    empOvertimeHours += hoursWorked - 9;
                } else if (hoursWorked < 9) {
                    empDelayHours += 9 - hoursWorked;
                }
            } else {
                empAbsenceDays++;
            }
        }

        // Calculate wages
        const basicWage = dailyWage * empDaysWorked + hourPrice * empOvertimeHours;
        const delayDeduction = hourPrice * empDelayHours;
        const absenceDeduction = dailyWage * empAbsenceDays;

        // Conditional deduction for day 10
        let deduction10Amount = 0;
        const day10Attendance = empAttendance[10];
        if (!day10Attendance || !day10Attendance.attendance || !day10Attendance.departure) {
            deduction10Amount = deduction10;
        }

        // Conditional deduction for day 20
        let deductionDay20Amount = 0;
        const day20Attendance = empAttendance[20];
        if (!day20Attendance || !day20Attendance.attendance || !day20Attendance.departure) {
            deductionDay20Amount = deductionDay20;
        }

        // Automatic loan deduction
        let loansMonthlyDeduction = 0;
        if (emp.loanRemaining > 0 && emp.loanMonthsPaid < loansMonths) {
            loansMonthlyDeduction = Math.min(emp.loanRemaining, loansDeduction / loansMonths);
        } else if (loansDeduction > 0 && emp.loanRemaining === undefined) {
            emp.loanRemaining = loansDeduction;
            loansMonthlyDeduction = Math.min(emp.loanRemaining, loansDeduction / loansMonths);
        }

        const netSalary = basicWage + additional - delayDeduction - absenceDeduction - loansMonthlyDeduction - insuranceDeduction - extraDeduction - deduction10Amount - deductionDay20Amount;

        // Add employee row
        printWindow.document.write(`
            <tr>
                <td>${name}</td>
                <td>${job}</td>
                <td>${branch}</td>
                <td>${netSalary.toFixed(2)}</td>
            </tr>
        `);

        grandTotalNetSalary += netSalary;
    });

    // Add total row
    printWindow.document.write(`
            <tr class="total-row">
                <td colspan="3">الإجمالي الكلي</td>
                <td>${grandTotalNetSalary.toFixed(2)}</td>
            </tr>
        </tbody>
    </table>
    </body>
    </html>
    `);

    // Print the window
    printWindow.document.close();
    printWindow.print();

    // Close the window after printing
    printWindow.onafterprint = function() {
        printWindow.close();
    };
}

// Print all employees with names, jobs, and net salaries in a table
function printAllEmployees() {
    if (employees.length === 0) {
        alert('لا توجد بيانات لطباعة الموظفين');
        return;
    }

    // Open a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');

    // Write the HTML content to the new window
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>جميع الموظفين</title>
            <style>
                body { font-family: "Cairo", sans-serif; margin: 20px; direction: rtl; }
                h1 { text-align: center; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                th { background: #f8f9fa; font-weight: bold; }
                .total-row { background: #e9ecef; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>جميع الموظفين - ${['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][parseInt(document.getElementById('monthSelect').value) - 1]} ${currentYear}</h1>
            <table>
                <thead>
                    <tr>
                        <th>الاسم</th>
                        <th>الوظيفة</th>
                        <th>صافي المرتب</th>
                    </tr>
                </thead>
                <tbody>
    `);

    let grandTotalNetSalary = 0;

    employees.forEach(emp => {
        const { name, job, hourPrice, dailyWage, extraDeduction, insuranceDeduction, loansDeduction, loansMonths, additional, deduction10 = 10, deductionDay20 = 20 } = emp;

        // Load attendance for this employee
        const empAttendance = JSON.parse(localStorage.getItem(getAttendanceKey(name))) || {};

        // Calculate attendance-based metrics
        let empDaysWorked = 0;
        let empOvertimeHours = 0;
        let empDelayHours = 0;
        let empAbsenceDays = 0;

        const currentMonth = parseInt(document.getElementById('monthSelect').value);
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const dayAttendance = empAttendance[day];
            if (dayAttendance && dayAttendance.attendance && dayAttendance.departure) {
                empDaysWorked++;
                const attendanceTime = new Date(`2000-01-01T${dayAttendance.attendance}`);
                const departureTime = new Date(`2000-01-01T${dayAttendance.departure}`);
                const hoursWorked = (departureTime - attendanceTime) / (1000 * 60 * 60);

                if (hoursWorked > 9) {
                    empOvertimeHours += hoursWorked - 9;
                } else if (hoursWorked < 9) {
                    empDelayHours += 9 - hoursWorked;
                }
            } else {
                empAbsenceDays++;
            }
        }

        // Calculate wages
        const basicWage = dailyWage * empDaysWorked + hourPrice * empOvertimeHours;
        const delayDeduction = hourPrice * empDelayHours;
        const absenceDeduction = dailyWage * empAbsenceDays;

        // Conditional deduction for day 10
        let deduction10Amount = 0;
        const day10Attendance = empAttendance[10];
        if (!day10Attendance || !day10Attendance.attendance || !day10Attendance.departure) {
            deduction10Amount = deduction10;
        }

        // Conditional deduction for day 20
        let deductionDay20Amount = 0;
        const day20Attendance = empAttendance[20];
        if (!day20Attendance || !day20Attendance.attendance || !day20Attendance.departure) {
            deductionDay20Amount = deductionDay20;
        }

        // Automatic loan deduction
        let loansMonthlyDeduction = 0;
        if (emp.loanRemaining > 0 && emp.loanMonthsPaid < loansMonths) {
            loansMonthlyDeduction = Math.min(emp.loanRemaining, loansDeduction / loansMonths);
        } else if (loansDeduction > 0 && emp.loanRemaining === undefined) {
            emp.loanRemaining = loansDeduction;
            loansMonthlyDeduction = Math.min(emp.loanRemaining, loansDeduction / loansMonths);
        }

        const netSalary = basicWage + additional - delayDeduction - absenceDeduction - loansMonthlyDeduction - insuranceDeduction - extraDeduction - deduction10Amount - deductionDay20Amount;

        grandTotalNetSalary += netSalary;

        printWindow.document.write(`
            <tr>
                <td>${name}</td>
                <td>${job}</td>
                <td>${netSalary.toFixed(2)}</td>
            </tr>
        `);
    });

    // Add the total row
    printWindow.document.write(`
            <tr class="total-row">
                <td colspan="2">الإجمالي الكلي</td>
                <td>${grandTotalNetSalary.toFixed(2)}</td>
            </tr>
        </tbody>
    </table>
    </body>
    </html>
    `);

    // Print the window
    printWindow.document.close();
    printWindow.print();

    // Close the window after printing
    printWindow.onafterprint = function() {
        printWindow.close();
    };
}



// Export data to JSON file
function exportData() {
    const data = {
        employees: employees,
        attendance: {}
    };

    // Collect attendance for all employees and months
    employees.forEach(emp => {
        const empName = emp.name;
        if (!data.attendance[empName]) data.attendance[empName] = {};
        for (let month = 1; month <= 12; month++) {
            const key = `attendance-${empName}-${currentYear}-${month}`;
            const att = localStorage.getItem(key);
            if (att) {
                data.attendance[empName][month] = JSON.parse(att);
            }
        }
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
}

// Import data from JSON file
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = JSON.parse(e.target.result);
        employees = data.employees || [];
        localStorage.setItem('employees', JSON.stringify(employees));

        // Clear old attendance data
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('attendance-')) {
                localStorage.removeItem(key);
            }
        }

        // Set new attendance data
        if (data.attendance) {
            Object.keys(data.attendance).forEach(empName => {
                Object.keys(data.attendance[empName]).forEach(month => {
                    const key = `attendance-${empName}-${currentYear}-${month}`;
                    localStorage.setItem(key, JSON.stringify(data.attendance[empName][month]));
                });
            });
        }

        // Update UI
        displayEmployees();
        populateEmployeeSelect();
        populateAttendanceEmployeeSelect();
        calculate();
    };
    reader.readAsText(file);
}

// Print pay sheet for all branches on one page
function printPaySheet() {
    // Get all unique branches
    const branches = [...new Set(employees.map(emp => emp.branch))];

    if (branches.length === 0) {
        alert('لا توجد فروع لطباعة ورقة القبض');
        return;
    }

    // Open a single new window for printing all branches
    const printWindow = window.open('', '_blank', 'width=800,height=600');

    // Write the HTML content to the new window
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>ورقة القبض - جميع الفروع</title>
            <style>
                body { font-family: "Cairo", sans-serif; margin: 20px; direction: rtl; }
                h1 { text-align: center; margin-bottom: 20px; }
                .branch-section { page-break-after: always; margin-bottom: 40px; }
                .branch-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; text-align: center; }
                .pay-sheet { border: 2px solid #000; padding: 20px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 20px; }
                .employee-card { border: 1px solid #000; padding: 10px; width: 200px; box-sizing: border-box; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
                th, td { border: 1px solid #ddd; padding: 4px; text-align: center; }
                th { background: #f8f9fa; }
                .negative { color: red; }
                .employee-name { font-weight: bold; font-size: 14px; margin-bottom: 10px; text-align: center; }
            </style>
        </head>
        <body>
            <h1>ورقة القبض - جميع الفروع</h1>
    `);

    // For each branch, add a section
    branches.forEach(branch => {
        printWindow.document.write(`
            <div class="branch-section">
                <div class="branch-title">ورقة القبض - ${branch}</div>
                <div class="pay-sheet">
        `);

        // Filter employees by branch
        const branchEmployees = employees.filter(emp => emp.branch === branch);

        // For each employee, add their details
        branchEmployees.forEach(emp => {
            const { name, hourPrice, dailyWage, extraDeduction, insuranceDeduction, loansDeduction, loansMonths, additional, deduction10 = 10, deductionDay20 = 20 } = emp;

            // Load attendance for this employee
            const empAttendance = JSON.parse(localStorage.getItem(getAttendanceKey(name))) || {};

            // Calculate attendance-based metrics
            let empDaysWorked = 0;
            let empOvertimeHours = 0;
            let empDelayHours = 0;
            let empAbsenceDays = 0;

            const currentMonth = parseInt(document.getElementById('monthSelect').value);
            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const dayAttendance = empAttendance[day];
                if (dayAttendance && dayAttendance.attendance && dayAttendance.departure) {
                    empDaysWorked++;
                    const attendanceTime = new Date(`2000-01-01T${dayAttendance.attendance}`);
                    const departureTime = new Date(`2000-01-01T${dayAttendance.departure}`);
                    const hoursWorked = (departureTime - attendanceTime) / (1000 * 60 * 60);

                    if (hoursWorked > 9) {
                        empOvertimeHours += hoursWorked - 9;
                    } else if (hoursWorked < 9) {
                        empDelayHours += 9 - hoursWorked;
                    }
                } else {
                    empAbsenceDays++;
                }
            }

            // Calculate wages
            const basicWage = dailyWage * empDaysWorked + hourPrice * empOvertimeHours;
            const delayDeduction = hourPrice * empDelayHours;
            const absenceDeduction = dailyWage * empAbsenceDays;

            // Conditional deduction for day 10
            let deduction10Amount = 0;
            const day10Attendance = empAttendance[10];
            if (!day10Attendance || !day10Attendance.attendance || !day10Attendance.departure) {
                deduction10Amount = deduction10;
            }

            // Conditional deduction for day 20
            let deductionDay20Amount = 0;
            const day20Attendance = empAttendance[20];
            if (!day20Attendance || !day20Attendance.attendance || !day20Attendance.departure) {
                deductionDay20Amount = deductionDay20;
            }

            // Automatic loan deduction
            let loansMonthlyDeduction = 0;
            if (emp.loanRemaining > 0 && emp.loanMonthsPaid < loansMonths) {
                loansMonthlyDeduction = Math.min(emp.loanRemaining, loansDeduction / loansMonths);
            } else if (loansDeduction > 0 && emp.loanRemaining === undefined) {
                emp.loanRemaining = loansDeduction;
                loansMonthlyDeduction = Math.min(emp.loanRemaining, loansDeduction / loansMonths);
            }

            const netSalary = basicWage + additional - delayDeduction - absenceDeduction - loansMonthlyDeduction - insuranceDeduction - extraDeduction - deduction10Amount - deductionDay20Amount;

            // Add employee section
            printWindow.document.write(`
                <div class="employee-card">
                    <div class="employee-name">${name}</div>
                    <table>
                        <tbody>
                            <tr><td>الفرع</td><td>${branch}</td></tr>
                            <tr><td>الشهر</td><td>${['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][currentMonth - 1]}</td></tr>
                            <tr><td>أيام العمل</td><td>${empDaysWorked}</td></tr>
                            <tr><td>ساعات إضافية</td><td>${empOvertimeHours.toFixed(2)}</td></tr>
                            <tr><td>ساعات تأخير</td><td>${empDelayHours.toFixed(2)}</td></tr>
                            <tr><td>أيام غياب</td><td>${empAbsenceDays}</td></tr>
                            <tr><td>الأجر الأساسي</td><td>${basicWage.toFixed(2)}</td></tr>
                            <tr><td>إضافي</td><td>${additional.toFixed(2)}</td></tr>
                            <tr><td>خصم تأخير</td><td class="negative">${delayDeduction.toFixed(2)}</td></tr>
                            <tr><td>خصم غياب</td><td class="negative">${absenceDeduction.toFixed(2)}</td></tr>
                            <tr><td>خصم سلف</td><td class="negative">${loansMonthlyDeduction.toFixed(2)}</td></tr>
                            <tr><td>خصم تأمينات</td><td class="negative">${insuranceDeduction.toFixed(2)}</td></tr>
                            <tr><td>خصم إضافي</td><td class="negative">${extraDeduction.toFixed(2)}</td></tr>
                            <tr><td>سحب 10</td><td class="negative">${deduction10Amount.toFixed(2)}</td></tr>
                            <tr><td>سحب 20</td><td class="negative">${deductionDay20Amount.toFixed(2)}</td></tr>
                            <tr><td>صافي المرتب</td><td>${netSalary.toFixed(2)}</td></tr>
                        </tbody>
                    </table>
                </div>
            `);
        });

        // Close the branch section
        printWindow.document.write(`
                </div>
            </div>
        `);
    });

    // Close the HTML
    printWindow.document.write(`
        </body>
        </html>
    `);

    // Print the window
    printWindow.document.close();
    printWindow.print();

    // Close the window after printing
    printWindow.onafterprint = function() {
        printWindow.close();
    };
}
