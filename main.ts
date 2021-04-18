///// УСТАНОВКИ
// Значения датчиков
let blackLeftColorS = 622, whiteLeftColorS = 501; // Левый
let blackRightColorS = 644, whiteRightColorS = 523; // Правый
// Значения серого для 2-х датчиков
let greyLeftColorS = (blackLeftColorS + whiteLeftColorS) / 2; // Серый левого
greyLeftColorS = GetRefNormValColorS(2, false, true); // Получаем окончательные значения серого левого датчика
let greyRightColorS = (blackRightColorS + whiteRightColorS) / 2; // Серый правого
greyRightColorS = GetRefNormValColorS(3, false, true); // Получаем окончательные значения серого правого датчика
const WHEELS_D = 62.4, WHEELS_W = 168; // Диамерт колёс, расстояние между центрами колёс в ММ
const TURN_DIR_SEARCH_LINE = 2; // Подворот при поиске линии для езды одним датчиком
const SPEED_AT_SEARCH_LINE = 20; // Скорость при поиске линии для езды одним датчиком
const DIST_BEFORE_INTERSECTION_FOR_TURN = 30; // Дистанция для дополнительного прохождения для последующего поворота в мм
const TIME_AFTER_TURN_TO_LINE_ALIGNMENT = 500; // Время для выравнивания после поворота до линии
const MOTOR_A_SPEED = 30; // Скорость работы средного мотора
const N_HT_COLOR_S_MEASUREMENTS = 10; // Количество измерений датчиками цвета

// Максимальные значения RGB (на белом цвете) для нормализации датчика определения цвета
let lColorSensorRgbMax: number[] = [15, 13, 16];
let rColorSensorRgbMax: number[] = [0, 0, 0];

// Установка ПИД
let Kp_TURN_CENTER = 0.2, Ki_TURN_CENTER = 0, Kd_TURN_CENTER = 2; // Для поворота относительно центра

let Kp_TURN_REL_L_MOT = 0.3, Ki_TURN_REL_L_MOT = 0, Kd_TURN_REL_L_MOT = 2.7; // Для поворота относительно правого колеса
let Kp_TURN_REL_R_MOT = 0.3, Ki_TURN_REL_R_MOT = 0, Kd_TURN_REL_R_MOT = 2.7; // Для поворота относительно левого колеса

let Kp_LINE_FOLLOW_2S = 0.1, Ki_LINE_FOLLOW_2S = 0, Kd_LINE_FOLLOW_2S = 2; // Для езды по линии с двумя датчиками
let Kp_LINE_FOLLOW_LS = 0.3, Ki_LINE_FOLLOW_LS = 0, Kd_LINE_FOLLOW_LS = 1; // Для езды левым датчиком по линии
let Kp_LINE_FOLLOW_RS = 0.3, Ki_LINE_FOLLOW_RS = 0, Kd_LINE_FOLLOW_RS = 1; // Для езды правым датчиком по линии

let Kp_L_LINE_ALIGN = 0.2, Ki_L_LINE_ALIGN = 0.001, Kd_L_LINE_ALIGN = 1; // Для выравнивания на линии левой стороной
let Kp_R_LINE_ALIGN = 0.2, Ki_R_LINE_ALIGN = 0.001, Kd_R_LINE_ALIGN = 1; // Для выравнивания на линии правой стороной
///////////////

// Управление захватом
function Grab(state: boolean) {
    brick.clearScreen();
    motors.mediumA.setBrake(true); // Устанавливаем ударжание мотора при остановке
    if (state) motors.mediumA.run(-MOTOR_A_SPEED); // В одну сторону
    else motors.mediumA.run(MOTOR_A_SPEED); // В другую сторону
    loops.pause(50); // Пауза для старта
    while (true) { // Проверяем, что мотор застопорился и не может больше двигаться
        let encA = motors.mediumA.angle();
        loops.pause(15); // Задержка между измерениями
        let encB = motors.mediumA.angle();
        if (Math.abs(Math.abs(encB) - Math.abs(encA)) <= 1) break;
    }
    motors.mediumA.stop(); // Останавливаем мотор
}

function СheckСolor(colorSensorSide: string): number {
    const NUM_YELLOW = 4, NUM_RED = 5; // Номера цветов
    let colorSensor: sensors.HiTechnicColorSensor;
    let colorSensorRgbMax: number[];
    if (colorSensorSide == "l") {
        colorSensor = sensors.hitechnicColor1;
        colorSensorRgbMax = lColorSensorRgbMax;
    }
    else if (colorSensorSide == "r") {
        colorSensor = sensors.hitechnicColor4;
        colorSensorRgbMax = rColorSensorRgbMax;
    }
    let colors: number[];
    for (let i = 0; i < N_HT_COLOR_S_MEASUREMENTS; i++) {
        let colorRgb = colorSensor.getRGB();
        let colorWhite = colorSensor.getWhite(); // For HT
        let hsv = RgbToHsv(colorRgb, colorWhite, colorSensorRgbMax, true);
        let currentColor = HsvToColor(hsv);
        colors[i] = currentColor;
    }
    let yellowNum = colors.filter(item => item === NUM_YELLOW).length;
    let redNum = colors.filter(item => item === NUM_RED).length;
    let outColor = -1;
    if (yellowNum > redNum) return outColor = NUM_YELLOW;
    else outColor = NUM_RED;
    return outColor;
}

// Поиск максимальных значений RGB для конвертации RGB в HSV, чтобы записать максимальные значения RGB
function SearchSensorRgbMax(colorSensor: sensors.HiTechnicColorSensor, sensorRgbMax: number[]): number[] { // colorSensor: sensors.ColorSensor / sensors.HiTechnicColorSensor
    let btnPressed = 0;
    while (btnPressed < 2) {
        let colorRgb = colorSensor.getRGB(); // colorSensor.rawRGB() для Lego Color Sensor
        if (brick.buttonEnter.wasPressed()) { btnPressed++; pause(500); }
        if (btnPressed == 0) {
            brick.clearScreen();
            brick.showValue("R", colorRgb[0], 1); brick.showValue("G", colorRgb[1], 2); brick.showValue("B", colorRgb[2], 3);
        } else if (btnPressed == 1) {
            sensorRgbMax[0] = Math.max(colorRgb[0], sensorRgbMax[0]);
            sensorRgbMax[1] = Math.max(colorRgb[1], sensorRgbMax[1]);
            sensorRgbMax[2] = Math.max(colorRgb[2], sensorRgbMax[2]);
            brick.showValue("R_max", sensorRgbMax[0], 1); brick.showValue("G_max", sensorRgbMax[1], 2); brick.showValue("B_max", sensorRgbMax[2], 3);
        }
        pause(10);
    }
    pause(500);
    return sensorRgbMax;
}

// Тестирование перевода из RGB в HSV и получение цвета
function TestRGBToHSVToColor() {
    let colorSensor = sensors.hitechnicColor1;
    lColorSensorRgbMax = SearchSensorRgbMax(colorSensor, lColorSensorRgbMax); // Найти максимальные значения
    while (true) {
        let colorRgb = colorSensor.getRGB();
        let colorWhite = colorSensor.getWhite(); // For HT
        //let colorWhite = colorRgb[0] + colorRgb[1] + colorRgb[2]; // For Lego
        brick.clearScreen();
        brick.showValue("R", colorRgb[0], 1); brick.showValue("G", colorRgb[1], 2); brick.showValue("B", colorRgb[2], 3); brick.showValue("W", colorWhite, 4);
        let hsv = RgbToHsv(colorRgb, colorWhite, lColorSensorRgbMax, true);
        let currentColor = HsvToColor(hsv);
        brick.showValue("color", currentColor, 8);
        pause(10);
    }
}

// Примеры функций
//DistMove(400, 40, true); // Движение на расстояние
//RampDistMove(400, 40, 0, 50); // Движение на расстояние с ускорением / замедлением
//LineFollowToDist(300, 50, true); // Движение по линии на расстояние
//LineFollowToIntersection("x", 60, true); // Движение по линии до пересечения
//LineAlignment(true, 40, 500); // Выравнивание перпендикулярно на линии
//AlignmentOnLine(500); // Выравнивание на линии
//TurnToLine("l", 50); // Поворот в сторону с линии на линию
//Grab(true); // true - закрыть, false - открыть
//TestRGBToHSVToColor(); // Тест перевода с RGB в HSV и в цвет
//PIDs_Tune(6); // Тестирование ПИДов

function Main() { // Главная функция
    sensors.color2.light(LightIntensityMode.ReflectedRaw); sensors.color3.light(LightIntensityMode.ReflectedRaw); // Активируем датчики
    sensors.hitechnicColor1._activated(); sensors.hitechnicColor4._activated();
    brick.clearScreen();
    brick.showString("             RUN", 6);
    while (!brick.buttonEnter.wasPressed()) { loops.pause(10); }
    brick.clearScreen();
    motors.mediumB.setInverted(true); motors.mediumC.setInverted(false); // Устанавливаем реверсы моторов
    motors.mediumB.setRegulated(true); motors.mediumC.setRegulated(true); // Устанавливаем регулирование моторов
    ////
    //TestRGBToHSVToColor();
    //PIDs_Tune(6);
    //TurnToLine("l", 40);
    //pause(2000);
    TurnToLine("r", true , 40);
    pause(10000);
    Grab(true);
    DistMove(150, 50, false);
    LineFollowToDist(150, 50, false);
    LineFollowToIntersection("l", 40, true);
    pause(500);
    TurnToLine("l", true, 40);
    pause(500);
    LineFollowToDist(350, 50, true);
    pause(500);
    Grab(false);
    pause(500);
    DistMove(50, -50, true);
    pause(500);
    TurnToLine("l", true, 40);
    pause(500);
    LineFollowToIntersection("x", 40, true);
    pause(500);
    TurnToLine("r", false, 40);
    pause(500);
    LineFollowToIntersection("l", 40, true);
    ////
    pause(1000);
    brick.exitProgram(); // Выход из программы
}

Main(); // Запуск главной функции