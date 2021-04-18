// УСТАНОВКИ
const ENC_TURN_TIME_DEREGULATION = 500, ENC_TURN_MAX_TIME = 5000; // Время для поворота энкодерами
const ENC_TURN_MAX_DEG_DIFFERENCE = 5; // Максимальная ошибка при повороте энкодерами
const GRAY_DIVIDER = 2; // Деление серого для определение пересечения

// Управление главными моторами
function BaseMotorsControl(dir: number, speed: number) {
    let mB = speed + dir, mC = speed - dir;
    let z = speed / Math.max(Math.abs(mB), Math.abs(mC));
    mB *= z; mC *= z;
    motors.mediumB.run(mB); motors.mediumC.run(mC);
}

// Обработка значений с датчиков цвета для линии
function GetRefNormValColorS(lineColorS: number, needAdapt: boolean = false, isGray: boolean = false): number {
    let rawRefValColorS = 0, blackValColorS = 0, whiteValColorS = 0;
    if (lineColorS == 2) {
        if (!isGray) rawRefValColorS = sensors.color2.light(LightIntensityMode.ReflectedRaw);
        else rawRefValColorS = greyLeftColorS;
        blackValColorS = blackLeftColorS;
        whiteValColorS = whiteLeftColorS;
    } else if (lineColorS == 3) {
        if (!isGray) rawRefValColorS = sensors.color3.light(LightIntensityMode.ReflectedRaw);
        else rawRefValColorS = greyRightColorS;
        blackValColorS = blackRightColorS;
        whiteValColorS = whiteRightColorS;
    }
    if (needAdapt && !isGray) AdaptationColorS(lineColorS, rawRefValColorS);
    rawRefValColorS = Math.map(rawRefValColorS, blackValColorS, whiteValColorS, 0, 100);
    rawRefValColorS = Math.constrain(rawRefValColorS, 0, 100);
    rawRefValColorS = Math.floor(rawRefValColorS); // Округлить до целого
    return rawRefValColorS;
}

// Адаптация значений белого и чёрного датчиков
function AdaptationColorS(lineColorS: number, rawRefValColorS: number) {
    if (lineColorS == 2) {
        if (rawRefValColorS < blackLeftColorS) blackLeftColorS = rawRefValColorS;
        else if (rawRefValColorS > whiteLeftColorS) whiteLeftColorS = rawRefValColorS;
    } else if (lineColorS == 3) {
        if (rawRefValColorS < blackRightColorS) blackRightColorS = rawRefValColorS;
        else if (rawRefValColorS > whiteRightColorS) whiteRightColorS = rawRefValColorS;
    }
}

// Движение по линии на расстояние
function LineFollowToDist(distance: number, speed: number = 60, setBreak: boolean = true, debug: boolean = false) {
    let lMotorRotateOld = motors.mediumB.angle() * -1, rMotorRotateOld = motors.mediumC.angle();
    let motorRotate = Math.round((distance / (Math.PI * WHEELS_D)) * 360); // Дистанция в мм
    let lMotorRotate = motorRotate + lMotorRotateOld, rMotorRotate = motorRotate + rMotorRotateOld; // Сколько нужно пройти моторам включая накрученное до этого
    automation.pid1.reset(); // Сброс ПИДа
    automation.pid1.setGains(Kp_LINE_FOLLOW_2S, Ki_LINE_FOLLOW_2S, Kd_LINE_FOLLOW_2S); // Установка значений регулятору для правой стороны
    automation.pid1.setControlSaturation(-100, 100); // Ограничения ПИДа
    let prevTime = 0;
    while (motors.mediumB.angle() * -1 <= lMotorRotate || motors.mediumC.angle() <= rMotorRotate) { // Пока моторы не достигнули градусов вращения
        let currTime = control.millis(), loopTime = currTime - prevTime;
        prevTime = currTime;
        let refLeftColorS = GetRefNormValColorS(2);
        let refRightColorS = GetRefNormValColorS(3);
        let error = refLeftColorS - refRightColorS;
        automation.pid1.setPoint(error); // Устанавливаем ошибку в регулятор
        let u = automation.pid1.compute(loopTime, 0); // Ругулятор
        BaseMotorsControl(u, speed); // Устанавливаем на моторы
        if (debug) {
            brick.clearScreen();
            brick.showValue("refLeftColorS", refLeftColorS, 1);
            brick.showValue("refRightColorS", refRightColorS, 2);
            brick.showValue("error", error, 3);
            brick.showValue("u", u, 4);
        }
        loops.pause(10);
    }
    motors.mediumB.setBrake(setBreak); motors.mediumC.setBrake(setBreak); // Установить жёсткий тормоз
    motors.mediumB.stop(); motors.mediumC.stop(); // Остановка моторов
    control.runInParallel(function () { music.playTone(Note.E, 500); }); // Сигнал для понимация о завершении
}

// Движение по линии до перекрёстка
function LineFollowToIntersection(crossType: string, speed: number = 60, continuation: boolean = true, setBreak: boolean = true, debug: boolean = false) {
    if (crossType == "x" || crossType == "t") { // X-образный или T-образный перекрёсток
        LineFollowToIntersectionX(speed, continuation, setBreak, debug);
    } else if (crossType == "l") { // Пересечение налево
        LineFollowToLeftIntersection(speed, continuation, setBreak, debug);
    } else if (crossType == "r") { // Пересечение направо
        LineFollowToRightIntersection(speed, continuation, setBreak, debug);
    }
}

// Движение по линии до перкрёстка двемя датчиками
function LineFollowToIntersectionX(speed: number = 60, continuation: boolean, setBreak: boolean, debug: boolean = false) {
    automation.pid1.reset(); // Сброс ПИДа
    automation.pid1.setGains(Kp_LINE_FOLLOW_2S, Ki_LINE_FOLLOW_2S, Kd_LINE_FOLLOW_2S); // Установка значений регулятору
    automation.pid1.setControlSaturation(-100, 100); // Ограничения ПИДа
    let prevTime = 0;
    while (true) {
        let currTime = control.millis(), loopTime = currTime - prevTime;
        prevTime = currTime;
        let refLeftColorS = GetRefNormValColorS(2);
        let refRightColorS = GetRefNormValColorS(3);
        if (refLeftColorS < (greyLeftColorS / GRAY_DIVIDER) && refRightColorS < (greyRightColorS / GRAY_DIVIDER)) break; // Выйти из цикла, если заехали на чёрное 2-мя датчиками
        let error = refLeftColorS - refRightColorS; // Находим ошибку регулирования
        automation.pid1.setPoint(error); // Устанавливаем ошибку в регулятор
        let u = automation.pid1.compute(loopTime, 0); // Регулятор
        BaseMotorsControl(u, speed);
        if (debug) {
            brick.clearScreen();
            brick.showValue("refLeftColorS", refLeftColorS, 1); brick.showValue("refRightColorS", refRightColorS, 2);
            brick.showValue("error", error, 3);
            brick.showValue("u", u, 4);
        }
        loops.pause(10);
    }
    // Нужно проехать дополнительное расстояние для поворота или для съезда с линии?
    if (continuation) DistMove(DIST_BEFORE_INTERSECTION_FOR_TURN, speed, setBreak);
    else {
        motors.mediumB.setBrake(setBreak); motors.mediumC.setBrake(setBreak); // Установить жёсткий тормоз
        motors.mediumB.stop(); motors.mediumC.stop(); // Остановка моторов
    }
    control.runInParallel(function () { music.playTone(Note.C, 500); }); // Сигнал для понимация
}

// Движение по линии до левого перекрёстка правым датчиком
function LineFollowToLeftIntersection(speed: number = 60, continuation: boolean, setBreak: boolean, debug: boolean = false) {
    let sideLineIsFound = false; // Флажок для линии сбоку
    automation.pid1.reset(); // Сброс ПИДа
    automation.pid1.setGains(Kp_LINE_FOLLOW_RS, Ki_LINE_FOLLOW_RS, Kd_LINE_FOLLOW_RS); // Установка значений регулятору
    automation.pid1.setControlSaturation(-100, 100); // Ограничения ПИДа
    let prevTime = 0;
    while (true) {
        let currTime = control.millis(), loopTime = currTime - prevTime;
        prevTime = currTime;
        let refLeftColorS = GetRefNormValColorS(2);
        let refRightColorS = GetRefNormValColorS(3);
        if (!sideLineIsFound) { // Пока линия не найдена подворачиваем в сторону линии
            if (refRightColorS <= greyRightColorS) { // Если линия найдена
                sideLineIsFound = true; // Установить, что линию нашли
                control.runInParallel(function () { music.playTone(Note.D, 200); }); // Сигнал для понимация
            } else BaseMotorsControl(-TURN_DIR_SEARCH_LINE, SPEED_AT_SEARCH_LINE); // Подворачиваем
        } else { // Нашли линию, двигаемся по линии
            if (refLeftColorS < (greyLeftColorS / GRAY_DIVIDER) && refRightColorS > (greyRightColorS / GRAY_DIVIDER)) break; // Выходим из цикла регулирования, если правый заехал на чёрное
            let error = greyRightColorS - refRightColorS;
            automation.pid1.setPoint(error); // Устанавливаем ошибку в регулятор
            let u = automation.pid1.compute(loopTime, 0); // Регулятор
            BaseMotorsControl(u, speed);
            if (debug) {
                brick.clearScreen();
                brick.showValue("refRightColorS", refRightColorS, 2);
                brick.showValue("error", error, 3);
                brick.showValue("u", u, 4);
            }
        }
        if (debug) {
            if (!sideLineIsFound) brick.clearScreen();
            brick.showValue("refLeftColorS", refLeftColorS, 1);
            brick.showValue("refRightColorS", refRightColorS, 2);
        }
        loops.pause(10);
    }
    // Нужно проехать дополнительное расстояние для поворота или для съезда с линии?
    if (continuation) DistMove(DIST_BEFORE_INTERSECTION_FOR_TURN, speed, setBreak);
    else {
        motors.mediumB.setBrake(setBreak); motors.mediumC.setBrake(setBreak); // Установить жёсткий тормоз
        motors.mediumB.stop(); motors.mediumC.stop(); // Остановка моторов
    }
    control.runInParallel(function () { music.playTone(Note.C, 500); }); // Сигнал для понимация
}

// Движение по линии до правого перекрёстка левым датчиком
function LineFollowToRightIntersection(speed: number = 60, continuation: boolean, setBreak: boolean, debug: boolean = false) {
    let sideLineIsFound = false; // Флажок для линии сбоку
    automation.pid1.reset(); // Сброс ПИДа
    automation.pid1.setGains(Kp_LINE_FOLLOW_LS, Ki_LINE_FOLLOW_LS, Kd_LINE_FOLLOW_LS); // Установка значений регулятору
    automation.pid1.setControlSaturation(-100, 100); // Ограничения ПИДа
    let prevTime = 0;
    while (true) {
        let currTime = control.millis(), loopTime = currTime - prevTime;
        prevTime = currTime;
        let refLeftColorS = GetRefNormValColorS(2);
        let refRightColorS = GetRefNormValColorS(3);
        if (!sideLineIsFound) { // Заставляем подворачивать в сторону линии
            if (refLeftColorS <= greyLeftColorS) {
                sideLineIsFound = true;// Установить, что линию нашли
                control.runInParallel(function () { music.playTone(Note.C, 200); }); // Сигнал для понимация
            } else BaseMotorsControl(TURN_DIR_SEARCH_LINE, SPEED_AT_SEARCH_LINE);
        } else {
            // Нашли линию, двигаемся по линии
            if (refLeftColorS < whiteLeftColorS && refLeftColorS > (greyLeftColorS / GRAY_DIVIDER) && refRightColorS < (greyRightColorS / GRAY_DIVIDER)) break; // Выходим из цикла регулирования по линии, если правый заехал на чёрное
            let error = refLeftColorS - greyLeftColorS;
            automation.pid1.setPoint(error); // Устанавливаем ошибку в регулятор
            let u = automation.pid1.compute(loopTime, 0); // Регулятор
            BaseMotorsControl(u, speed);
            if (debug) {
                brick.clearScreen();
                brick.showValue("refLeftColorS", refLeftColorS, 1);
                brick.showValue("error", error, 3);
                brick.showValue("u", u, 4);
            }
        }
        if (debug) {
            if (!sideLineIsFound) brick.clearScreen();
            brick.showValue("refLeftColorS", refLeftColorS, 1);
            brick.showValue("refRightColorS", refRightColorS, 2);
        }
        loops.pause(10);
    }
    // Нужно проехать дополнительное расстояние для поворота или для съезда с линии?
    if (continuation) DistMove(DIST_BEFORE_INTERSECTION_FOR_TURN, speed, setBreak);
    else {
        motors.mediumB.setBrake(setBreak); motors.mediumC.setBrake(setBreak); // Установить жёсткий тормоз
        motors.mediumB.stop(); motors.mediumC.stop(); // Остановка моторов
    }
    control.runInParallel(function () { music.playTone(Note.C, 500); }); // Сигнал для понимация
}

// Выравнивание на линии перпендикулярно
function LineAlignment(lineIsForward: boolean, speed: number = 40, alignmentTime: number = 1000, debug: boolean = false) {
    speed = Math.min(Math.abs(speed), 100);
    automation.pid1.reset(); automation.pid2.reset(); // Сброс ПИДов
    automation.pid1.setGains(Kp_L_LINE_ALIGN, Ki_L_LINE_ALIGN, Kd_L_LINE_ALIGN); // Установка значений регулятору для левой стороны
    automation.pid2.setGains(Kp_R_LINE_ALIGN, Ki_R_LINE_ALIGN, Kd_R_LINE_ALIGN); // Установка значений регулятору для правой стороны
    automation.pid1.setControlSaturation(-100, 100); automation.pid2.setControlSaturation(-100, 100);
    let multiplaer = (lineIsForward ? -1 : 1); // lineIsForward - линия спереди, иначе сзади
    control.timer8.reset(); // Сброс таймера
    let prevTime = 0;
    while (control.timer8.millis() < alignmentTime) {
        let currTime = control.millis(), loopTime = currTime - prevTime;
        prevTime = currTime;
        let refLeftColorS = GetRefNormValColorS(2);
        let refRightColorS = GetRefNormValColorS(3);
        let errorL = greyLeftColorS - refLeftColorS, errorR = greyRightColorS - refRightColorS; // Вычисляем ошибки регулирования
        automation.pid1.setPoint(errorL); // Устанавливаем ошибку в регулятор левой стороны
        automation.pid2.setPoint(errorR); // Устанавливаем ошибку в регулятор правой стороны
        let uL = automation.pid1.compute(loopTime, 0) * multiplaer; // Ругулятор левой стороны
        let uR = automation.pid2.compute(loopTime, 0) * multiplaer; // Ругулятор правой стороны
        motors.mediumB.run(uL); motors.mediumC.run(uR); // Устанавливаем на моторы
        if (debug) {
            brick.clearScreen();
            brick.showValue("refLeftColorS", refLeftColorS, 1);
            brick.showValue("refRightColorS", refRightColorS, 2);
            brick.showValue("errorL", errorL, 3);
            brick.showValue("errorR", errorR, 4);
            brick.showValue("uL", uL, 5);
            brick.showValue("uR", uR, 6);
        }
        loops.pause(10);
    }
    motors.mediumB.setBrake(true); motors.mediumC.setBrake(true); // Установить жёсткий тормоз
    motors.mediumB.stop(); motors.mediumC.stop(); // Остановка моторов
    control.runInParallel(function () { music.playTone(Note.E, 50); }); // Сигнал о завершении
}

// Движение на заданное расстояние
function DistMove(distance: number, speed: number = 30, setBreak: boolean = true) {
    let motorRotate = Math.round((distance / (Math.PI * WHEELS_D)) * 360); // Дистанция в мм
    motors.mediumB.setBrake(setBreak); motors.mediumC.setBrake(setBreak); // Установить тип торможения
    motors.mediumB.setPauseOnRun(false); motors.mediumC.setPauseOnRun(false); // Отключаем
    motors.mediumB.run(speed, motorRotate, MoveUnit.Degrees); motors.mediumC.run(speed, motorRotate, MoveUnit.Degrees);
    motors.mediumB.pauseUntilReady(); motors.mediumC.pauseUntilReady(); // Ждём выполнения моторами команды
}

// Движение на заданное расстояние с ускорением и замедлением
function RampDistMove(distance: number, speed: number = 30, acelerationDist: number = 0, decelerationDist: number) {
    let acelerationRotate = (acelerationDist == 0 ? 0 : Math.round((acelerationDist / (Math.PI * WHEELS_D)) * 360));
    let decelerationRotate = (decelerationDist == 0 ? 0 : Math.round((decelerationDist / (Math.PI * WHEELS_D)) * 360));
    let normMotorRotate = Math.round((distance / (Math.PI * WHEELS_D)) * 360) - acelerationRotate - decelerationRotate; // Дистанция в мм
    motors.mediumB.setBrake(true); motors.mediumC.setBrake(true); // Установить тип торможения
    motors.mediumB.setPauseOnRun(false); motors.mediumC.setPauseOnRun(false); // Отключаем
    motors.mediumB.ramp(speed, normMotorRotate, MoveUnit.Degrees, acelerationRotate, decelerationRotate);
    motors.mediumC.ramp(speed, normMotorRotate, MoveUnit.Degrees, acelerationRotate, decelerationRotate);
    motors.mediumB.pauseUntilReady(); motors.mediumC.pauseUntilReady(); // Ждём выполнения моторами команды
}

// Повороты с помощью энкодеров
function EncTurn(relative: string, degress: number = 0, speed: number = 30, debug: boolean = false) {
    if (relative == "c") {
        EncTurnRelativeCenterWheels(degress, speed, debug);
    } else if (relative == "l") {
        EncTurnRelativeLeftWheel(degress, speed, debug);
    } else if (relative == "r") {
        EncTurnRelativeRightWheel(degress, speed, debug);
    }
}

// Поворот относительно центра колёс
function EncTurnRelativeCenterWheels(degress: number, speed: number = 30, debug: boolean = false) {
    let lMotorEncOld = motors.mediumB.angle() * -1, rMotorEncOld = motors.mediumC.angle(); // Получаем текущие углы энкодеров
    let motorRotate = Math.round((degress * WHEELS_W) / WHEELS_D); // Вычисления угла поворота
    let lMotorRotate = lMotorEncOld + motorRotate, rMotorRotate = rMotorEncOld + -motorRotate; // Вычисляем окончательные положения моторов
    automation.pid2.reset(); // Сброс ПИДа
    automation.pid2.setGains(Kp_TURN_CENTER, Ki_TURN_CENTER, Kd_TURN_CENTER); // Регулятор поворота для левого мотора
    automation.pid2.setControlSaturation(-100, 100);
    let isTurned = false; // Почти довернулся? - флажок
    control.timer7.reset(); // Таймер защиты максимального времени поворота сброс
    motors.mediumB.setBrake(true); motors.mediumC.setBrake(true); // Режим удержания моторов
    let prevTime = 0;
    while (true) {
        let currTime = control.millis(), loopTime = currTime - prevTime;
        prevTime = currTime;
        let lMotorEnc = motors.mediumB.angle() * -1, rMotorEnc = motors.mediumC.angle(); // Учитываем, что при реверсе моторов знаки у энкодеров не меняются
        let errorL = lMotorRotate - lMotorEnc, errorR = rMotorRotate - rMotorEnc;
        let error = 0 - (errorL - errorR);
        automation.pid2.setPoint(error);
        let u = automation.pid2.compute(loopTime, 0) * -1;
        if (!isTurned && Math.abs(error) <= ENC_TURN_MAX_DEG_DIFFERENCE && Math.abs(u) <= 10) { // Довернулись?
            isTurned = true; // Повернулись до нужного градуса
            control.timer8.reset();
            control.runInParallel(function () { music.playTone(Note.D, 50); }); // Сигнал о завершении
        }
        if (isTurned == true && control.timer8.millis() >= ENC_TURN_TIME_DEREGULATION || control.timer7.millis() >= ENC_TURN_MAX_TIME) break; // Дорегулируемся
        motors.mediumB.run(u); motors.mediumC.run(-u);
        if (debug) {
            brick.clearScreen();
            brick.showValue("motorRotate", motorRotate, 1);
            brick.showValue("lMotorEnc", lMotorEnc, 2); brick.showValue("rMotorEnc", rMotorEnc, 3);
            brick.showValue("errorL", errorL, 4); brick.showValue("errorR", errorR, 5);
            brick.showValue("error", error, 6);
            brick.showValue("u", u, 7);
        }
        pause(10);
    }
    motors.mediumB.stop(); motors.mediumC.stop(); // Остановка моторов
    control.runInParallel(function () { music.playTone(Note.C, 50); }); // Сигнал о завершении
}

// Поворот относительно левого колеса
function EncTurnRelativeLeftWheel(degress: number, speed: number = 30, debug: boolean = false) {
    let rMotorEncOld = motors.mediumC.angle(); // Получаем текущие углы энкодеров
    let motorRotate = ((degress * WHEELS_W) / WHEELS_D) * 2; // Вычисления угла поворота
    motorRotate = rMotorEncOld + motorRotate; // Вычисляем окончательные положения мотора
    automation.pid2.reset(); // Сброс ПИДа
    automation.pid2.setGains(Kp_TURN_REL_L_MOT, Ki_TURN_REL_L_MOT, Kd_TURN_REL_L_MOT); // Регулятор поворота относительно левого мотора
    automation.pid2.setControlSaturation(-100, 100);
    let isTurned = false; // Почти довернулся? - флажок
    control.timer7.reset(); // Таймер защиты максимального времени поворота сброс
    motors.mediumB.setBrake(true); motors.mediumC.setBrake(true); // Режим удержания моторов
    motors.mediumB.stop(); // Останавливаем левый мотор
    let prevTime = 0;
    while (true) {
        let currTime = control.millis(), loopTime = currTime - prevTime;
        prevTime = currTime;
        let rMotorEnc = motors.mediumC.angle(); // Учитываем, что при реверсе моторов знаки у энкодеров не меняются
        let error = motorRotate - rMotorEnc;
        if (!isTurned && Math.abs(error) <= ENC_TURN_MAX_DEG_DIFFERENCE) { // Довернулись?
            isTurned = true; // Повернулись до нужного градуса
            control.timer8.reset();
            control.runInParallel(function () { music.playTone(Note.D, 50); }); // Сигнал о завершении
        }
        if (isTurned == true && control.timer8.millis() >= ENC_TURN_TIME_DEREGULATION || control.timer7.millis() >= ENC_TURN_MAX_TIME) break; // Дорегулируемся
        automation.pid2.setPoint(error);
        let u = automation.pid2.compute(loopTime, 0);
        motors.mediumC.run(u);
        if (debug) {
            brick.clearScreen();
            brick.showValue("motorRotate", motorRotate, 1);
            brick.showValue("rMotorEnc", rMotorEnc, 2);
            brick.showValue("errorL", error, 4);
            brick.showValue("error", error, 5);
            brick.showValue("u", u, 7);
        }
        pause(10);
    }
    motors.mediumB.stop(); motors.mediumC.stop(); // Остановка моторов
    control.runInParallel(function () { music.playTone(Note.C, 50); }); // Сигнал о завершении
}

// Поворот относительно правого колеса
function EncTurnRelativeRightWheel(degress: number, speed: number = 30, debug: boolean = false) {
    let lMotorEncOld = motors.mediumB.angle() * -1; // Получаем текущие углы энкодеров
    let motorRotate = ((degress * WHEELS_W) / WHEELS_D) * 2; // Вычисления угла поворота
    motorRotate += lMotorEncOld; // Вычисляем окончательные положения мотора
    automation.pid2.reset(); // Сброс ПИДа
    automation.pid2.setGains(Kp_TURN_REL_R_MOT, Ki_TURN_REL_R_MOT, Kd_TURN_REL_R_MOT); // Регулятор поворота относительно левого мотора
    automation.pid2.setControlSaturation(-100, 100);
    let isTurned = false; // Почти довернулся? - флажок
    control.timer7.reset(); // Таймер защиты максимального времени поворота сброс
    motors.mediumB.setBrake(true); motors.mediumC.setBrake(true); // Режим удержания моторов
    motors.mediumC.stop(); // Останавливаем правый мотор
    let prevTime = 0;
    while (true) {
        let currTime = control.millis(), loopTime = currTime - prevTime;
        prevTime = currTime;
        let lMotorEnc = motors.mediumB.angle() * -1; // Учитываем, что при реверсе моторов знаки у энкодеров не меняются
        let error = motorRotate - lMotorEnc;
        if (!isTurned && Math.abs(error) <= ENC_TURN_MAX_DEG_DIFFERENCE) { // Довернулись?
            isTurned = true; // Повернулись до нужного градуса
            control.timer8.reset();
            control.runInParallel(function () { music.playTone(Note.D, 50); }); // Сигнал о завершении
        }
        if (isTurned == true && control.timer8.millis() >= ENC_TURN_TIME_DEREGULATION || control.timer7.millis() >= ENC_TURN_MAX_TIME) break; // Дорегулируемся
        automation.pid2.setPoint(error);
        let u = automation.pid2.compute(loopTime, 0);
        motors.mediumB.run(u);
        if (debug) {
            brick.clearScreen();
            brick.showValue("motorRotate", motorRotate, 1);
            brick.showValue("lMotorEnc", lMotorEnc, 2);
            brick.showValue("errorL", error, 4);
            brick.showValue("error", error, 5);
            brick.showValue("u", u, 6);
        }
        pause(10);
    }
    motors.mediumB.stop(); motors.mediumC.stop(); // Остановка моторов
    control.runInParallel(function () { music.playTone(Note.C, 50); }); // Сигнал о завершении
}

// Поворот в сторону с линии на линию
function TurnToLine(side: string, xCrossType: boolean, speed: number = 50, debug: boolean = false) {
    if (side == "l") {
        TurnToLineLeft(xCrossType, speed, debug);
    } else if (side == "r") {
        TurnToLineRight(xCrossType, speed, debug);
    } else music.playSoundEffectUntilDone(sounds.informationError);
    if (side == "l" || side == "r") control.runInParallel(function () { music.playTone(Note.D, 200); }); // Сигнал для понимация о завершении
}

// Поворот с линии на линию слева
function TurnToLineLeft(xCrossType: boolean, speed: number = 50, debug: boolean = false) {
    motors.mediumB.run(-speed); motors.mediumC.run(speed); // Начинаем поворот
    // Выполнение условий
    if (xCrossType) { // Линии - продолжения вперёд - нет)
        while (true) { // Пока правый датчик на белом
            let refRightColorS = GetRefNormValColorS(3);
            if (refRightColorS == 0) continue;
            if (refRightColorS < greyRightColorS) break; // Выходим, если датчик нашёл серое значение (линию)
            loops.pause(5);
        }
        if (debug) control.runInParallel(function () { music.playTone(Note.C, 200); }); // Сигнал для понимация состояния
        while (true) { // Пока левый датчик на белом
            let refLeftColorS = GetRefNormValColorS(2);
            if (refLeftColorS == 0) continue;
            if (refLeftColorS < greyLeftColorS) break; // Выходим, если датчик нашёл серое значение (линию)
            loops.pause(5);
        }
        if (debug) control.runInParallel(function () { music.playTone(Note.C, 200); }); // Сигнал для понимация состояния
        while (true) { // Пока датчики не на белом
            let refLeftColorS = GetRefNormValColorS(2);
            let refRightColorS = GetRefNormValColorS(3);
            if (refLeftColorS > greyLeftColorS && refRightColorS > greyRightColorS) break; // Выходим, если датчики на белом
            loops.pause(5);
        }
    } else {
        while (true) { // Пока левый датчик на белом
            let refLeftColorS = GetRefNormValColorS(2);
            if (refLeftColorS == 0) continue;
            if (refLeftColorS < greyLeftColorS) break; // Выходим, если датчик нашёл серое значение (линию)
            loops.pause(5);
        }
        if (debug) control.runInParallel(function () { music.playTone(Note.C, 200); }); // Сигнал для понимация состояния
        while (true) { // Пока датчики не на белом
            let refLeftColorS = GetRefNormValColorS(2);
            let refRightColorS = GetRefNormValColorS(3);
            if (refLeftColorS > greyLeftColorS && refRightColorS > greyRightColorS) break; // Выходим, если датчики на белом
            loops.pause(5);
        }
    }
    motors.mediumB.setBrake(true); motors.mediumC.setBrake(true); // Устанавливаем удержание мотора для тормоза
    motors.mediumB.stop(); motors.mediumC.stop(); // Останавливаем моторы
    control.runInParallel(function () { music.playTone(Note.C, 200); }); // Сигнал для понимация состояния
    AlignmentOnLine(TIME_AFTER_TURN_TO_LINE_ALIGNMENT, debug); // Выравниваемся на линии
}

// Поворот с линии на линию справа
function TurnToLineRight(xCrossType: boolean, speed: number = 50, debug: boolean = false) {
    motors.mediumB.run(speed); motors.mediumC.run(-speed); // Начинаем поворот
    // Выполнение условий
    if (xCrossType) { // Линии - продолжения вперёд - нет)
        while (true) { // Пока левый датчик на белом
            let refLeftColorS = GetRefNormValColorS(2);
            if (refLeftColorS == 0) continue;
            if (refLeftColorS < greyLeftColorS) break; // Выходим, если датчик нашёл серое значение (линию)
            loops.pause(5);
        }
        if (debug) control.runInParallel(function () { music.playTone(Note.C, 200); }); // Сигнал для понимация состояния
        while (true) { // Пока правый датчик на белом
            let refRightColorS = GetRefNormValColorS(3);
            if (refRightColorS == 0) continue;
            if (refRightColorS < greyRightColorS) break; // Выходим, если датчик нашёл серое значение (линию)
            loops.pause(5);
        }
        if (debug) control.runInParallel(function () { music.playTone(Note.C, 200); }); // Сигнал для понимация состояния
        while (true) {
            let refLeftColorS = GetRefNormValColorS(2);
            let refRightColorS = GetRefNormValColorS(3);
            if (refLeftColorS > greyLeftColorS && refRightColorS > greyRightColorS) break; // Выходим, если датчики на белом
            loops.pause(5);
        }
    } else {
        while (true) { // Пока левый датчик на белом
            let refRightColorS = GetRefNormValColorS(3);
            if (refRightColorS == 0) continue;
            if (refRightColorS < greyRightColorS) break; // Выходим, если датчик нашёл серое значение (линию)
            loops.pause(5);
        }
        if (debug) control.runInParallel(function () { music.playTone(Note.C, 200); }); // Сигнал для понимация состояния
        while (true) { // Пока датчики не на белом
            let refLeftColorS = GetRefNormValColorS(2);
            let refRightColorS = GetRefNormValColorS(3);
            if (refLeftColorS > greyLeftColorS && refRightColorS > greyRightColorS) break; // Выходим, если датчики на белом
            loops.pause(5);
        }
    }
    motors.mediumB.setBrake(true); motors.mediumC.setBrake(true); // Устанавливаем удержание мотора для тормоза
    motors.mediumB.stop(); motors.mediumC.stop(); // Останавливаем моторы
    control.runInParallel(function () { music.playTone(Note.C, 200); }); // Сигнал для понимация состояния
    AlignmentOnLine(TIME_AFTER_TURN_TO_LINE_ALIGNMENT, debug); // Выравниваемся на линии
}

// Выравнивание робота, когда линия между датчиками
function AlignmentOnLine(time: number, debug: boolean = false) {
    automation.pid1.reset(); // Сброс ПИДа
    automation.pid1.setGains(Kp_ALIGN_ON_LINE, Ki_ALIGN_ON_LINE, Kd_ALIGN_ON_LINE); // Установка значений регулятору
    automation.pid1.setControlSaturation(-100, 100); // Ограничение ПИДа
    control.timer7.reset();
    let prevTime = 0;
    while (control.timer7.millis() < time) { // Пока моторы не достигнули градусов вращения
        let currTime = control.millis(), loopTime = currTime - prevTime;
        prevTime = currTime;
        let refLeftColorS = GetRefNormValColorS(2);
        let refRightColorS = GetRefNormValColorS(3);
        let error = refLeftColorS - refRightColorS;
        automation.pid1.setPoint(error); // Устанавливаем ошибку в регулятор
        let u = automation.pid1.compute(loopTime, 0); // Ругулятор
        motors.mediumB.run(u); motors.mediumC.run(-u);
        if (debug) {
            brick.clearScreen();
            brick.showValue("refLeftColorS", refLeftColorS, 1);
            brick.showValue("refRightColorS", refRightColorS, 2);
            brick.showValue("error", error, 3);
            brick.showValue("u", u, 4);
        }
        loops.pause(10);
    }
    motors.mediumB.setBrake(true); motors.mediumC.setBrake(true); // Устанавливаем удержание мотора для тормоза
    motors.mediumB.stop(); motors.mediumC.stop(); // Останавливаем моторы
    control.runInParallel(function () { music.playTone(Note.E, 100); }); // Сигнал для понимация состояния
}

// Настройка ПИДов
function PIDs_Tune(screen: number = 0) {
    const SCREEN_N = 8, STR_N = 8, BTN_PRESS_LOOP_DELAY = 150;
    while (true) {
        let Kp_H = 0.1, Ki_H = 0.001, Kd_H = 0.1;
        let str = 1; // Выделеная строка
        let strState = false;
        while (true) {
            brick.clearScreen(); // Очищаем экран
            if (screen == 0) { // Выводим на экран
                brick.showString("PIDs TURN_CENTER", 1);
                brick.showValue((str == 2 && !strState ? "> " : (str == 2 && strState ? ">>> " : "")) + "Kp", Kp_TURN_CENTER, 4);
                brick.showValue((str == 3 && !strState ? "> " : (str == 3 && strState ? ">>> " : "")) + "Ki", Ki_TURN_CENTER, 5);
                brick.showValue((str == 4 && !strState ? "> " : (str == 4 && strState ? ">>> " : "")) + "Kd", Kd_TURN_CENTER, 6);
            } else if (screen == 1) {
                brick.showString("PIDs TURN_REL_L_M", 1);
                brick.showValue((str == 2 && !strState ? "> " : (str == 2 && strState ? ">>> " : "")) + "Kp", Kp_TURN_REL_L_MOT, 4);
                brick.showValue((str == 3 && !strState ? "> " : (str == 3 && strState ? ">>> " : "")) + "Ki", Ki_TURN_REL_L_MOT, 5);
                brick.showValue((str == 4 && !strState ? "> " : (str == 4 && strState ? ">>> " : "")) + "Kd", Kd_TURN_REL_L_MOT, 6);
            } else if (screen == 2) {
                brick.showString("PID TURN_REL_R_M", 1);
                brick.showValue((str == 2 && !strState ? "> " : (str == 2 && strState ? ">>> " : "")) + "Kp", Kp_TURN_REL_R_MOT, 4);
                brick.showValue((str == 3 && !strState ? "> " : (str == 3 && strState ? ">>> " : "")) + "Ki", Ki_TURN_REL_R_MOT, 5);
                brick.showValue((str == 4 && !strState ? "> " : (str == 4 && strState ? ">>> " : "")) + "Kd", Kd_TURN_REL_R_MOT, 6);
            } else if (screen == 3) {
                brick.showString("PID LINE_FOLLOW_2S", 1);
                brick.showValue((str == 2 && !strState ? "> " : (str == 2 && strState ? ">>> " : "")) + "Kp", Kp_LINE_FOLLOW_2S, 4);
                brick.showValue((str == 3 && !strState ? "> " : (str == 3 && strState ? ">>> " : "")) + "Ki", Ki_LINE_FOLLOW_2S, 5);
                brick.showValue((str == 4 && !strState ? "> " : (str == 4 && strState ? ">>> " : "")) + "Kd", Kd_LINE_FOLLOW_2S, 6);
            } else if (screen == 4) {
                brick.showString("PID LINE_FOLLOW_LS", 1);
                brick.showValue((str == 2 && !strState ? "> " : (str == 2 && strState ? ">>> " : "")) + "Kp", Kp_LINE_FOLLOW_LS, 4);
                brick.showValue((str == 3 && !strState ? "> " : (str == 3 && strState ? ">>> " : "")) + "Ki", Ki_LINE_FOLLOW_LS, 5);
                brick.showValue((str == 4 && !strState ? "> " : (str == 4 && strState ? ">>> " : "")) + "Kd", Kd_LINE_FOLLOW_LS, 6);
            } else if (screen == 5) {
                brick.showString("PID LINE_FOLLOW_RS", 1);
                brick.showValue((str == 2 && !strState ? "> " : (str == 2 && strState ? ">>> " : "")) + "Kp", Kp_LINE_FOLLOW_RS, 4);
                brick.showValue((str == 3 && !strState ? "> " : (str == 3 && strState ? ">>> " : "")) + "Ki", Ki_LINE_FOLLOW_RS, 5);
                brick.showValue((str == 4 && !strState ? "> " : (str == 4 && strState ? ">>> " : "")) + "Kd", Kd_LINE_FOLLOW_RS, 6);
            } else if (screen == 6) {
                brick.showString("PID Kp_L_LINE_ALIGN", 1);
                brick.showValue((str == 2 && !strState ? "> " : (str == 2 && strState ? ">>> " : "")) + "Kp", Kp_L_LINE_ALIGN, 4);
                brick.showValue((str == 3 && !strState ? "> " : (str == 3 && strState ? ">>> " : "")) + "Ki", Ki_L_LINE_ALIGN, 5);
                brick.showValue((str == 4 && !strState ? "> " : (str == 4 && strState ? ">>> " : "")) + "Kd", Kd_L_LINE_ALIGN, 6);
            } else if (screen == 7) {
                brick.showString("PID Kp_R_LINE_ALIGN", 1);
                brick.showValue((str == 2 && !strState ? "> " : (str == 2 && strState ? ">>> " : "")) + "Kp", Kp_R_LINE_ALIGN, 4);
                brick.showValue((str == 3 && !strState ? "> " : (str == 3 && strState ? ">>> " : "")) + "Ki", Ki_R_LINE_ALIGN, 5);
                brick.showValue((str == 4 && !strState ? "> " : (str == 4 && strState ? ">>> " : "")) + "Kd", Kd_R_LINE_ALIGN, 6);
            } else brick.showString("PID NONE", 1);
            brick.showString((str == 1 && !strState ? "> " : (str == 1 && strState ? ">>> " : "")) + "BREAK FOR TEST", 2);
            brick.showString((str == 5 && !strState ? "> " : (str == 5 && strState ? ">>> " : "")) + "BREAK FOR TEST", 8);
            brick.showValue((str == 6 && !strState ? "> " : (str == 6 && strState ? ">>> " : "")) + "Kp_H", Kp_H, 10);
            brick.showValue((str == 7 && !strState ? "> " : (str == 7 && strState ? ">>> " : "")) + "Ki_H", Ki_H, 11);
            brick.showValue((str == 8 && !strState ? "> " : (str == 8 && strState ? ">>> " : "")) + "Kd_H", Kd_H, 12);
            brick.showValue("screen", screen, 12); brick.showString((str == 1 && !strState ? "> " : (str == 1 && strState ? ">>> " : "")) + "BREAK FOR TEST", 2);
            brick.showString((str == 5 && !strState ? "> " : (str == 5 && strState ? ">>> " : "")) + "BREAK FOR TEST", 8);
            brick.showValue((str == 6 && !strState ? "> " : (str == 6 && strState ? ">>> " : "")) + "Kp_H", Kp_H, 10);
            brick.showValue((str == 7 && !strState ? "> " : (str == 7 && strState ? ">>> " : "")) + "Ki_H", Ki_H, 11);
            brick.showValue((str == 8 && !strState ? "> " : (str == 8 && strState ? ">>> " : "")) + "Kd_H", Kd_H, 12);
            if (brick.buttonEnter.wasPressed()) { // Считываем нажатие ENTER
                if (str == 1 || str == 5) { // Нажали на строку BREAK?
                    if (screen == 0) EncTurn("c", 90, 50, true);
                    else if (screen == 1) EncTurn("l", 90, 50, true);
                    else if (screen == 2) EncTurn("r", 90, 50, true);
                    else if (screen == 6 || screen == 7) LineAlignment(true, 40, 10000, true);
                    else if (screen == 3) LineFollowToIntersection("x", 50, false, true);
                    else if (screen == 5) LineFollowToIntersection("l", 50, false, true);
                    else if (screen == 4) LineFollowToIntersection("r", 50, false, true);
                    else break;
                } else {
                    if (!strState) strState = !strState;
                    else if (strState) {
                        strState = !strState;
                        control.timer1.reset(); // Костыль от переключения экрана после изменения коэффициента и применения
                    }
                    control.runInParallel(function () { music.playTone(Note.F, 50); }); // Сигнал
                    continue;
                }
            }
            if (strState) { // Если активно изменение
                if (brick.buttonLeft.isPressed()) { // Изменяем коэффициент
                    if (screen == 0) {
                        if (str == 2) Kp_TURN_CENTER -= Kp_H;
                        else if (str == 3) Ki_TURN_CENTER -= Ki_H;
                        else if (str == 4) Kd_TURN_CENTER -= Kd_H;
                    } else if (screen == 1) {
                        if (str == 2) Kp_TURN_REL_L_MOT -= Kp_H;
                        else if (str == 3) Ki_TURN_REL_L_MOT -= Ki_H;
                        else if (str == 4) Kd_TURN_REL_L_MOT -= Kd_H;
                    } else if (screen == 2) {
                        if (str == 2) Kp_TURN_REL_R_MOT -= Kp_H;
                        else if (str == 3) Ki_TURN_REL_R_MOT -= Ki_H;
                        else if (str == 4) Kd_TURN_REL_R_MOT -= Kd_H;
                    } else if (screen == 3) {
                        if (str == 2) Kp_LINE_FOLLOW_2S -= Kp_H;
                        else if (str == 3) Ki_LINE_FOLLOW_2S -= Ki_H;
                        else if (str == 4) Kd_LINE_FOLLOW_2S -= Kd_H;
                    } else if (screen == 4) {
                        if (str == 2) Kp_LINE_FOLLOW_LS -= Kp_H;
                        else if (str == 3) Ki_LINE_FOLLOW_LS -= Ki_H;
                        else if (str == 4) Kd_LINE_FOLLOW_LS -= Kd_H;
                    } else if (screen == 5) {
                        if (str == 2) Kp_LINE_FOLLOW_RS -= Kp_H;
                        else if (str == 3) Ki_LINE_FOLLOW_RS -= Ki_H;
                        else if (str == 4) Kd_LINE_FOLLOW_RS -= Kd_H;
                    } else if (screen == 6) {
                        if (str == 2) Kp_L_LINE_ALIGN -= Kp_H;
                        else if (str == 3) Ki_L_LINE_ALIGN -= Ki_H;
                        else if (str == 4) Kd_L_LINE_ALIGN -= Kd_H;
                    } else if (screen == 7) {
                        if (str == 2) Kp_R_LINE_ALIGN -= Kp_H;
                        else if (str == 3) Ki_R_LINE_ALIGN -= Ki_H;
                        else if (str == 4) Kd_R_LINE_ALIGN -= Kd_H;
                    }
                    else if (str == 6) Kp_H -= 0.01;
                    else if (str == 7) Ki_H -= 0.00001;
                    else if (str == 8) Kd_H -= 0.001;
                    loops.pause(BTN_PRESS_LOOP_DELAY);
                    continue;
                } else if (brick.buttonRight.isPressed()) {
                    if (screen == 0) {
                        if (str == 2) Kp_TURN_CENTER += Kp_H;
                        else if (str == 3) Ki_TURN_CENTER += Ki_H;
                        else if (str == 4) Kd_TURN_CENTER += Kd_H;
                    } else if (screen == 1) {
                        if (str == 2) Kp_TURN_REL_L_MOT += Kp_H;
                        else if (str == 3) Ki_TURN_REL_L_MOT += Ki_H;
                        else if (str == 4) Kd_TURN_REL_L_MOT += Kd_H;
                    } else if (screen == 2) {
                        if (str == 2) Kp_TURN_REL_R_MOT += Kp_H;
                        else if (str == 3) Ki_TURN_REL_R_MOT += Ki_H;
                        else if (str == 4) Kd_TURN_REL_R_MOT += Kd_H;
                    } else if (screen == 3) {
                        if (str == 2) Kp_LINE_FOLLOW_2S += Kp_H;
                        else if (str == 3) Ki_LINE_FOLLOW_2S += Ki_H;
                        else if (str == 4) Kd_LINE_FOLLOW_2S += Kd_H;
                    } else if (screen == 4) {
                        if (str == 2) Kp_LINE_FOLLOW_LS += Kp_H;
                        else if (str == 3) Ki_LINE_FOLLOW_LS += Ki_H;
                        else if (str == 4) Kd_LINE_FOLLOW_LS += Kd_H;
                    } else if (screen == 5) {
                        if (str == 2) Kp_LINE_FOLLOW_RS += Kp_H;
                        else if (str == 3) Ki_LINE_FOLLOW_RS += Ki_H;
                        else if (str == 4) Kd_LINE_FOLLOW_RS += Kd_H;
                    } else if (screen == 6) {
                        if (str == 2) Kp_L_LINE_ALIGN += Kp_H;
                        else if (str == 3) Ki_L_LINE_ALIGN += Ki_H;
                        else if (str == 4) Kd_L_LINE_ALIGN += Kd_H;
                    } else if (screen == 7) {
                        if (str == 2) Kp_R_LINE_ALIGN += Kp_H;
                        else if (str == 3) Ki_R_LINE_ALIGN += Ki_H;
                        else if (str == 4) Kd_R_LINE_ALIGN += Kd_H;
                    }
                    else if (str == 6) Kp_H += 0.01;
                    else if (str == 7) Ki_H += 0.00001;
                    else if (str == 8) Kd_H += 0.001;
                    loops.pause(BTN_PRESS_LOOP_DELAY);
                    continue;
                }
                if (brick.buttonUp.wasPressed()) { // Выходим из редактирования коэффициента, если нажали вверх/вниз
                    strState = !strState;
                    str--;
                    control.runInParallel(function () { music.playTone(Note.C, 50); }); // Сигнал
                } else if (brick.buttonDown.wasPressed()) {
                    strState = !strState;
                    str++;
                    control.runInParallel(function () { music.playTone(Note.C, 50); }); // Сигнал
                }
            } else { // Если изменение не активно
                if (brick.buttonLeft.wasPressed() && control.timer1.millis() >= 100) {
                    screen--;
                    control.runInParallel(function () { music.playTone(Note.C, 50); }); // Сигнал о переключении экрана
                } else if (brick.buttonRight.wasPressed() && control.timer1.millis() >= 100) {
                    screen++;
                    control.runInParallel(function () { music.playTone(Note.C, 50); }); // Сигнал о переключении экрана
                }
                if (brick.buttonUp.wasPressed()) str--;
                else if (brick.buttonDown.wasPressed()) str++;
            }
            if (str > STR_N) str = 1;
            else if (str < 1) str = STR_N;
            if (screen > SCREEN_N - 1) screen = 0;
            else if (screen < 0) screen = SCREEN_N - 1;
            loops.pause(10);
        }
        brick.clearScreen(); // Очищаем экран
    }
    loops.pause(100);
}