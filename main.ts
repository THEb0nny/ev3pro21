///// УСТАНОВКИ
// Значения датчиков
let blackLeftColorS = 643, whiteLeftColorS = 516; // Левый
let blackRightColorS = 646, whiteRightColorS = 512; // Правый
// Значения серого для 2-х датчиков
let greyLeftColorS = (blackLeftColorS + whiteLeftColorS) / 2; // Серый левого
greyLeftColorS = GetRefNormValColorS(2, false, true); // Получаем окончательные значения серого левого датчика
let greyRightColorS = (blackRightColorS + whiteRightColorS) / 2; // Серый правого
greyRightColorS = GetRefNormValColorS(3, false, true); // Получаем окончательные значения серого правого датчика

const WHEELS_D = 62.4, WHEELS_W = 168; // Диамерт колёс, расстояние между центрами колёс в ММ
const TURN_DIR_SEARCH_LINE = 2; // Подворот при поиске линии для езды одним датчиком
const SPEED_AT_SEARCH_LINE = 20; // Скорость при поиске линии для езды одним датчиком
const DIST_AFTER_INTERSECTION = 30; // Дистанция для дополнительного прохождения для последующего поворота в мм
const TIME_AFTER_TURN_TO_LINE_ALIGNMENT = 500; // Время для выравнивания после поворота до линии
const GRAB_MOTOR_SPEED = 40; // Скорость работы средного мотора
const N_HT_COLOR_S_MEASUREMENTS = 15; // Количество измерений датчиками цвета
const DELAY_FOR_START_MANIP = 75; // Задержка для старта моторов перед определением стопора мотора

// Максимальные значения RGB (на белом цвете) для нормализации датчика определения цвета
let lColorSensorRgbMax: number[] = [20, 18, 20];
let rColorSensorRgbMax: number[] = [18, 17, 19];

// Установка ПИД
let Kp_LINE_FOLLOW_2S = 0.1, Ki_LINE_FOLLOW_2S = 0, Kd_LINE_FOLLOW_2S = 0.5; // Для езды по линии с двумя датчиками
let Kp_LINE_FOLLOW_LS = 0.1, Ki_LINE_FOLLOW_LS = 0, Kd_LINE_FOLLOW_LS = 2.0; // Для езды левым датчиком по линии
let Kp_LINE_FOLLOW_RS = 0.1, Ki_LINE_FOLLOW_RS = 0, Kd_LINE_FOLLOW_RS = 2.0; // Для езды правым датчиком по линии

let Kp_TURN_CENTER = 0.2, Ki_TURN_CENTER = 0, Kd_TURN_CENTER = 2; // Для поворота относительно центра

let Kp_TURN_REL_L_MOT = 0.3, Ki_TURN_REL_L_MOT = 0, Kd_TURN_REL_L_MOT = 2.7; // Для поворота относительно правого колеса
let Kp_TURN_REL_R_MOT = 0.3, Ki_TURN_REL_R_MOT = 0, Kd_TURN_REL_R_MOT = 2.7; // Для поворота относительно левого колеса

let Kp_ALIGN_ON_LINE = 0.2, Ki_ALIGN_ON_LINE = 0, Kd_ALIGN_ON_LINE = 2; // Для выравнивание между линией

let Kp_L_LINE_ALIGN = 0.17, Ki_L_LINE_ALIGN = 0.001, Kd_L_LINE_ALIGN = 1; // Для выравнивания на линии левой стороной
let Kp_R_LINE_ALIGN = 0.17, Ki_R_LINE_ALIGN = 0.001, Kd_R_LINE_ALIGN = 1; // Для выравнивания на линии правой стороной
///////////////

// Проверка
function СheckСolor(colorSensorSide: string): number {
    const NUM_YELLOW = 4, NUM_RED = 5, NUM_EMPTY = 0; // Номера цветов
    let kYellow = 0, kRed = 0, kEmpty = 0;
    let colorSensor: sensors.HiTechnicColorSensor;
    let colorSensorRgbMax: number[];
    if (colorSensorSide == "l") {
        colorSensor = sensors.hitechnicColor1;
        colorSensorRgbMax = lColorSensorRgbMax;
    } else if (colorSensorSide == "r") {
        colorSensor = sensors.hitechnicColor4;
        colorSensorRgbMax = rColorSensorRgbMax;
    }
    let colors: number[] = [];
    for (let i = 0; i < N_HT_COLOR_S_MEASUREMENTS; i++) {
        let colorRgb = sensors.hitechnicColor1.getRGB();
        let colorWhite = sensors.hitechnicColor1.getWhite(); // Only for HT
        let hsv = RgbToHsv(colorRgb, colorWhite, colorSensorRgbMax, true);
        brick.showString(hsv[0].toString() + " " + hsv[1].toString() + " " + hsv[2].toString(), 10);
        colors[i] = HsvToColor(hsv);
        if (colors[i] == NUM_YELLOW) kYellow++;
        else if (colors[i] == NUM_RED) kRed++;
        else if (colors[i] == NUM_EMPTY) kEmpty++;
        loops.pause(50);
    }
    if (kYellow > kRed && kYellow > kEmpty) return NUM_YELLOW;
    else if (kRed > kYellow && kRed > kEmpty) return NUM_RED;
    else return NUM_EMPTY;
}

// Примеры функций
//DistMove(400, 40, true); // Движение на расстояние
//RampDistMove(400, 40, 0, 50); // Движение на расстояние с ускорением / замедлением
//LineFollowToDist(300, 50, true); // Движение по линии на расстояние
//LineFollowToIntersection("x", 60, true); // Движение по линии до пересечения
//LineAlignment(true, 40, 500); // Выравнивание перпендикулярно на линии
//AlignmentOnLine(500); // Выравнивание на линии
//TurnToLine("l", true, 50); // Поворот в сторону с линии на линию
//EncTurn("c", 90, 40); // Повороты на угол по энкодеру
//Grab(true); // true - закрыть, false - открыть

//PIDs_Tune(6); // Тестирование ПИДов

function Main() { // Главная функция
    motors.mediumB.setInverted(true); motors.mediumC.setInverted(false); // Устанавливаем реверсы моторов
    motors.mediumB.setRegulated(true); motors.mediumC.setRegulated(true); // Устанавливаем регулирование моторов
    brick.clearScreen();
    brick.showString("         RUN", 6);
    while (!brick.buttonEnter.wasPressed()) {
        // Активируем датчики
        sensors.color2.light(LightIntensityMode.ReflectedRaw); sensors.color3.light(LightIntensityMode.ReflectedRaw);
        sensors.hitechnicColor1.getAll(); sensors.hitechnicColor4.getAll();
        loops.pause(10);
    }
    brick.clearScreen();
    ////
    PIDs_Tune(3);
    Grab(true);
    let ledColor = СheckСolor("l");
    brick.showValue("ledColor", ledColor, 11);
    DistMove(150, 50, false);
    if (ledColor == 4) {
        LineFollowToIntersection("l", 40, true);
        EncTurn("c", -90, 40); //TurnToLine("l", true, 40);
        LineFollowToDist(370, 30, true);
        Grab(false);
        pause(100);
        DistMove(50, -50, true);
        pause(100);
        EncTurn("c", 180, 40); //TurnToLine("l", true, 40);
        //AlignmentOnLine(500);
        pause(100);
        LineFollowToIntersection("x", 40, true);
        LineAlignment(false, 30, 500);
        DistMove(20, 40, true);
        pause(100);
        EncTurn("c", 90, 40); //TurnToLine("r", false, 40);
        AlignmentOnLine(500);
        pause(100);
        LineFollowToDist(100, 50, true); //LineFollowToIntersection("l", 40, true); //DistMove(100, 40, true);
    } else {
        LineFollowToIntersection("r", 40, true, false);
        LineFollowToIntersection("r", 40, true, false);
        LineFollowToIntersection("r", 40, true, false);
        LineFollowToIntersection("r", 40, true, false);
        EncTurn("c", 90, 40);
        LineFollowToDist(370, 30, true);
        Grab(false);
        DistMove(50, -50, true);
        EncTurn("c", 180, 40);
        LineFollowToDist(320, 30, true);
        EncTurn("c", -90, 40);
        LineFollowToIntersection("l", 40, false, false);
        LineFollowToIntersection("l", 40, false, false);
        LineFollowToIntersection("l", 40, false, false);

        pause(100);
    }
    ledColor = СheckСolor("l");
    brick.showValue("ledColor", ledColor, 11);
    if (ledColor == 5) {
        DistMove(20, 40, true);
        EncTurn("c", -90, 40);
        DistMove(100, 40, true);
        Grab(true);
    } else {
        EncTurn("c", -180, 40);
    }
    ////
    pause(5000);
    //brick.exitProgram(); // Выход из программы
}

Main(); // Запуск главной функции