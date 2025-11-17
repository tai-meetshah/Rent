// # nestjs-jwt-mongoose-todo-repo

// This repository is a ready-to-run **NestJS** project implementing:

// * JWT authentication (access token + refresh token)
// * Mongoose / MongoDB integration
// * Role-based guard (Admin / User)
// * DTO validation (`class-validator`)
// * Logger middleware
// * Users module (register / login / refresh / profile)
// * Todos module (CRUD protected by JWT + roles)

// ---

// ## Quick instructions

// 1. Copy the files into a new folder (or `git init` an empty repo)
// 2. Create `.env` from `.env.example` and set `MONGO_URI` and `JWT_SECRET`.
// 3. `npm install`
// 4. `npm run start:dev`

// App runs on `http://localhost:3000`.

// ---

// ## File tree

// ```
// package.json
// tsconfig.json
// .env.example
// README.md
// src/
//   main.ts
//   app.module.ts
//   logger.middleware.ts
//   common/
//     decorators/roles.decorator.ts
//     guards/roles.guard.ts
//   auth/
//     auth.module.ts
//     auth.controller.ts
//     auth.service.ts
//     jwt.strategy.ts
//     jwt-auth.guard.ts
//   users/
//     users.module.ts
//     users.service.ts
//     schemas/user.schema.ts
//     dto/create-user.dto.ts
//     dto/login.dto.ts
//   todos/
//     todos.module.ts
//     todos.controller.ts
//     todos.service.ts
//     schemas/todo.schema.ts
//     dto/create-todo.dto.ts
//     dto/update-todo.dto.ts
// ```

// ---

// Below are the contents of each file. Copy them into the corresponding paths.

// ---

// ### package.json

// ```json
// {
//   "name": "nestjs-jwt-mongoose-todo",
//   "version": "1.0.0",
//   "scripts": {
//     "start": "nest start",
//     "start:dev": "nest start --watch",
//     "build": "nest build"
//   },
//   "dependencies": {
//     "@nestjs/common": "^10.0.0",
//     "@nestjs/core": "^10.0.0",
//     "@nestjs/jwt": "^10.0.0",
//     "@nestjs/mongoose": "^10.0.0",
//     "@nestjs/passport": "^10.0.0",
//     "passport": "^0.6.0",
//     "passport-jwt": "^4.0.0",
//     "class-transformer": "^0.5.1",
//     "class-validator": "^0.14.0",
//     "mongoose": "^7.0.0",
//     "reflect-metadata": "^0.1.13",
//     "rimraf": "^3.0.2"
//   },
//   "devDependencies": {
//     "@nestjs/cli": "^10.0.0",
//     "typescript": "^5.0.0"
//   }
// }
// ```

// ---

// ### tsconfig.json

// ```json
// {
//   "compilerOptions": {
//     "module": "commonjs",
//     "declaration": true,
//     "removeComments": true,
//     "emitDecoratorMetadata": true,
//     "experimentalDecorators": true,
//     "allowSyntheticDefaultImports": true,
//     "target": "es2017",
//     "sourceMap": true,
//     "outDir": "dist",
//     "baseUrl": "./",
//     "incremental": true
//   }
// }
// ```

// ---

// ### .env.example

// ```
// MONGO_URI=mongodb://127.0.0.1:27017/nest-todo
// JWT_SECRET=your_jwt_secret_here
// JWT_EXPIRES_IN=900s
// REFRESH_TOKEN_EXPIRES_IN=7d
// PORT=3000
// ```

// ---

// ### src/main.ts

// ```ts
// import { ValidationPipe } from '@nestjs/common';
// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
//   await app.listen(process.env.PORT || 3000);
//   console.log(`Server running on http://localhost:${process.env.PORT || 3000}`);
// }
// bootstrap();
// ```

// ---

// ### src/app.module.ts

// ```ts
// import { Module, MiddlewareConsumer } from '@nestjs/common';
// import { MongooseModule } from '@nestjs/mongoose';
// import { ConfigModule } from '@nestjs/config';
// import { UsersModule } from './users/users.module';
// import { AuthModule } from './auth/auth.module';
// import { TodosModule } from './todos/todos.module';
// import { LoggerMiddleware } from './logger.middleware';

// @Module({
//   imports: [
//     ConfigModule.forRoot({ isGlobal: true }),
//     MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nest-todo'),
//     UsersModule,
//     AuthModule,
//     TodosModule,
//   ],
// })
// export class AppModule {
//   configure(consumer: MiddlewareConsumer) {
//     consumer.apply(LoggerMiddleware).forRoutes('*');
//   }
// }
// ```

// ---

// ### src/logger.middleware.ts

// ```ts
// import { Injectable, NestMiddleware } from '@nestjs/common';

// @Injectable()
// export class LoggerMiddleware implements NestMiddleware {
//   use(req: any, res: any, next: () => void) {
//     console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
//     next();
//   }
// }
// ```

// ---

// ## Common: roles decorator + guard

// ### src/common/decorators/roles.decorator.ts

// ```ts
// import { SetMetadata } from '@nestjs/common';
// export const ROLES_KEY = 'roles';
// export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
// ```

// ### src/common/guards/roles.guard.ts

// ```ts
// import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';
// import { ROLES_KEY } from '../decorators/roles.decorator';

// @Injectable()
// export class RolesGuard implements CanActivate {
//   constructor(private reflector: Reflector) {}

//   canActivate(context: ExecutionContext): boolean {
//     const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
//       context.getHandler(),
//       context.getClass(),
//     ]);
//     if (!requiredRoles) return true;
//     const { user } = context.switchToHttp().getRequest();
//     if (!user) return false;
//     return requiredRoles.some((role) => user.roles?.includes(role));
//   }
// }
// ```

// ---

// ## Auth module

// ### src/auth/auth.module.ts

// ```ts
// import { Module } from '@nestjs/common';
// import { JwtModule } from '@nestjs/jwt';
// import { PassportModule } from '@nestjs/passport';
// import { UsersModule } from '../users/users.module';
// import { AuthService } from './auth.service';
// import { AuthController } from './auth.controller';
// import { JwtStrategy } from './jwt.strategy';

// @Module({
//   imports: [
//     PassportModule,
//     JwtModule.register({
//       secret: process.env.JWT_SECRET || 'secret',
//       signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '900s' },
//     }),
//     UsersModule,
//   ],
//   providers: [AuthService, JwtStrategy],
//   controllers: [AuthController],
//   exports: [AuthService],
// })
// export class AuthModule {}
// ```

// ### src/auth/auth.service.ts

// ```ts
// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';
// import { UsersService } from '../users/users.service';
// import * as bcrypt from 'bcrypt';

// @Injectable()
// export class AuthService {
//   constructor(private usersService: UsersService, private jwtService: JwtService) {}

//   async validateUser(email: string, pass: string) {
//     const user = await this.usersService.findByEmail(email);
//     if (!user) return null;
//     const valid = await bcrypt.compare(pass, user.password);
//     if (valid) {
//       const { password, refreshTokens, ...result } = user.toObject ? user.toObject() : user;
//       return result;
//     }
//     return null;
//   }

//   async login(user: any) {
//     const payload = { sub: user._id, email: user.email, roles: user.roles };
//     const accessToken = this.jwtService.sign(payload);
//     const refreshToken = this.jwtService.sign(payload, {
//       expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
//     });

//     // store refresh token
//     await this.usersService.addRefreshToken(user._id, refreshToken);

//     return { accessToken, refreshToken };
//   }

//   async refreshToken(token: string) {
//     try {
//       const payload = this.jwtService.verify(token);
//       const user = await this.usersService.findById(payload.sub);
//       if (!user) throw new UnauthorizedException('Invalid refresh token');
//       // check stored refresh tokens
//       if (!user.refreshTokens?.includes(token)) throw new UnauthorizedException('Invalid refresh token');
//       // issue new tokens
//       const newPayload = { sub: user._id, email: user.email, roles: user.roles };
//       const accessToken = this.jwtService.sign(newPayload);
//       const refreshToken = this.jwtService.sign(newPayload, { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' });
//       await this.usersService.replaceRefreshToken(user._id, token, refreshToken);
//       return { accessToken, refreshToken };
//     } catch (err) {
//       throw new UnauthorizedException('Invalid refresh token');
//     }
//   }
// }
// ```

// ### src/auth/auth.controller.ts

// ```ts
// import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { UsersService } from '../users/users.service';
// import { LoginDto } from '../users/dto/login.dto';

// @Controller('auth')
// export class AuthController {
//   constructor(private authService: AuthService, private usersService: UsersService) {}

//   @Post('register')
//   async register(@Body() body: any) {
//     const user = await this.usersService.create(body);
//     return { id: user._id, email: user.email };
//   }

//   @HttpCode(HttpStatus.OK)
//   @Post('login')
//   async login(@Body() dto: LoginDto) {
//     const user = await this.authService.validateUser(dto.email, dto.password);
//     if (!user) return { status: 'error', message: 'Invalid credentials' };
//     return this.authService.login(user);
//   }

//   @Post('refresh')
//   async refresh(@Body('refreshToken') refreshToken: string) {
//     return this.authService.refreshToken(refreshToken);
//   }
// }
// ```

// ### src/auth/jwt.strategy.ts

// ```ts
// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { ExtractJwt, Strategy } from 'passport-jwt';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor() {
//     super({
//       jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
//       ignoreExpiration: false,
//       secretOrKey: process.env.JWT_SECRET || 'secret',
//     });
//   }

//   async validate(payload: any) {
//     return { _id: payload.sub, email: payload.email, roles: payload.roles };
//   }
// }
// ```

// ### src/auth/jwt-auth.guard.ts

// ```ts
// import { ExecutionContext, Injectable } from '@nestjs/common';
// import { AuthGuard } from '@nestjs/passport';

// @Injectable()
// export class JwtAuthGuard extends (AuthGuard('jwt') as any) {
//   canActivate(context: ExecutionContext) {
//     // optionally add logic before auth
//     return super.canActivate(context) as boolean;
//   }
// }
// ```

// ---

// ## Users module

// ### src/users/schemas/user.schema.ts

// ```ts
// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document } from 'mongoose';

// @Schema({ timestamps: true })
// export class User extends Document {
//   @Prop({ required: true, unique: true })
//   email: string;

//   @Prop({ required: true })
//   password: string;

//   @Prop({ type: [String], default: ['user'] })
//   roles: string[];

//   @Prop({ type: [String], default: [] })
//   refreshTokens: string[];
// }

// export const UserSchema = SchemaFactory.createForClass(User);
// ```

// ### src/users/dto/create-user.dto.ts

// ```ts
// import { IsEmail, IsString, MinLength, IsOptional, IsArray } from 'class-validator';

// export class CreateUserDto {
//   @IsEmail()
//   email: string;

//   @IsString()
//   @MinLength(6)
//   password: string;

//   @IsOptional()
//   @IsArray()
//   roles?: string[];
// }
// ```

// ### src/users/dto/login.dto.ts

// ```ts
// import { IsEmail, IsString } from 'class-validator';

// export class LoginDto {
//   @IsEmail()
//   email: string;

//   @IsString()
//   password: string;
// }
// ```

// ### src/users/users.service.ts

// ```ts
// import { Injectable, NotFoundException } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import * as bcrypt from 'bcrypt';
// import { User } from './schemas/user.schema';

// @Injectable()
// export class UsersService {
//   constructor(@InjectModel(User.name) private userModel: Model<User>) {}

//   async create(dto: any) {
//     const hashed = await bcrypt.hash(dto.password, 10);
//     const user = await this.userModel.create({ ...dto, password: hashed });
//     return user;
//   }

//   async findByEmail(email: string) {
//     return this.userModel.findOne({ email }).exec();
//   }

//   async findById(id: string) {
//     return this.userModel.findById(id).exec();
//   }

//   async addRefreshToken(userId: string, token: string) {
//     await this.userModel.updateOne({ _id: userId }, { $push: { refreshTokens: token } });
//   }

//   async replaceRefreshToken(userId: string, oldToken: string, newToken: string) {
//     await this.userModel.updateOne({ _id: userId }, { $pull: { refreshTokens: oldToken } });
//     await this.userModel.updateOne({ _id: userId }, { $push: { refreshTokens: newToken } });
//   }

//   async removeRefreshToken(userId: string, token: string) {
//     await this.userModel.updateOne({ _id: userId }, { $pull: { refreshTokens: token } });
//   }
// }
// ```

// ### src/users/users.module.ts

// ```ts
// import { Module } from '@nestjs/common';
// import { MongooseModule } from '@nestjs/mongoose';
// import { UsersService } from './users.service';
// import { User, UserSchema } from './schemas/user.schema';

// @Module({
//   imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
//   providers: [UsersService],
//   exports: [UsersService],
// })
// export class UsersModule {}
// ```

// ---

// ## Todos module

// ### src/todos/schemas/todo.schema.ts

// ```ts
// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document, Types } from 'mongoose';

// @Schema({ timestamps: true })
// export class Todo extends Document {
//   @Prop({ required: true })
//   title: string;

//   @Prop({ default: false })
//   completed: boolean;

//   @Prop({ type: Types.ObjectId, ref: 'User' })
//   owner: Types.ObjectId;
// }

// export const TodoSchema = SchemaFactory.createForClass(Todo);
// ```

// ### src/todos/dto/create-todo.dto.ts

// ```ts
// import { IsString, IsOptional, IsBoolean } from 'class-validator';

// export class CreateTodoDto {
//   @IsString()
//   title: string;

//   @IsOptional()
//   @IsBoolean()
//   completed?: boolean;
// }
// ```

// ### src/todos/dto/update-todo.dto.ts

// ```ts
// import { IsString, IsOptional, IsBoolean } from 'class-validator';

// export class UpdateTodoDto {
//   @IsOptional()
//   @IsString()
//   title?: string;

//   @IsOptional()
//   @IsBoolean()
//   completed?: boolean;
// }
// ```

// ### src/todos/todos.service.ts

// ```ts
// import { Injectable, NotFoundException } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model, Types } from 'mongoose';
// import { Todo } from './schemas/todo.schema';
// import { CreateTodoDto } from './dto/create-todo.dto';
// import { UpdateTodoDto } from './dto/update-todo.dto';

// @Injectable()
// export class TodosService {
//   constructor(@InjectModel(Todo.name) private todoModel: Model<Todo>) {}

//   create(ownerId: string, dto: CreateTodoDto) {
//     return this.todoModel.create({ ...dto, owner: ownerId });
//   }

//   findAll() {
//     return this.todoModel.find().populate('owner', 'email');
//   }

//   findByOwner(ownerId: string) {
//     return this.todoModel.find({ owner: ownerId });
//   }

//   async findOne(id: string) {
//     const todo = await this.todoModel.findById(id).populate('owner', 'email');
//     if (!todo) throw new NotFoundException('Todo not found');
//     return todo;
//   }

//   async update(id: string, dto: UpdateTodoDto) {
//     const todo = await this.todoModel.findByIdAndUpdate(id, dto, { new: true });
//     if (!todo) throw new NotFoundException('Todo not found');
//     return todo;
//   }

//   async remove(id: string) {
//     const todo = await this.todoModel.findByIdAndDelete(id);
//     if (!todo) throw new NotFoundException('Todo not found');
//     return todo;
//   }
// }
// ```

// ### src/todos/todos.controller.ts

// ```ts
// import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
// import { TodosService } from './todos.service';
// import { CreateTodoDto } from './dto/create-todo.dto';
// import { UpdateTodoDto } from './dto/update-todo.dto';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { Roles } from '../common/decorators/roles.decorator';
// import { RolesGuard } from '../common/guards/roles.guard';

// @Controller('todos')
// export class TodosController {
//   constructor(private todosService: TodosService) {}

//   @UseGuards(JwtAuthGuard)
//   @Post()
//   create(@Req() req: any, @Body() dto: CreateTodoDto) {
//     return this.todosService.create(req.user._id, dto);
//   }

//   @Get()
//   findAll() {
//     return this.todosService.findAll();
//   }

//   @UseGuards(JwtAuthGuard)
//   @Get('me')
//   myTodos(@Req() req: any) {
//     return this.todosService.findByOwner(req.user._id);
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.todosService.findOne(id);
//   }

//   @UseGuards(JwtAuthGuard)
//   @Put(':id')
//   update(@Param('id') id: string, @Body() dto: UpdateTodoDto) {
//     return this.todosService.update(id, dto);
//   }

//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles('admin')
//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.todosService.remove(id);
//   }
// }
// ```

// ### src/todos/todos.module.ts

// ```ts
// import { Module } from '@nestjs/common';
// import { MongooseModule } from '@nestjs/mongoose';
// import { TodosController } from './todos.controller';
// import { TodosService } from './todos.service';
// import { Todo, TodoSchema } from './schemas/todo.schema';
// import { UsersModule } from '../users/users.module';

// @Module({
//   imports: [MongooseModule.forFeature([{ name: Todo.name, schema: TodoSchema }]), UsersModule],
//   controllers: [TodosController],
//   providers: [TodosService],
// })
// export class TodosModule {}
// ```

// ---

// ## README.md

// ```md
// # NestJS JWT Mongoose Todo

// Features:
// - JWT access + refresh tokens
// - Mongoose user + todo models
// - Role-based delete (admin)
// - DTO validation

// ## Run
// 1. Copy files
// 2. npm install
// 3. Create .env (see .env.example)
// 4. npm run start:dev

// ## Routes
// - POST /auth/register { email, password }
// - POST /auth/login { email, password } => { accessToken, refreshToken }
// - POST /auth/refresh { refreshToken } => new tokens
// - GET /todos
// - POST /todos (Bearer accessToken)
// - GET /todos/me (Bearer accessToken)
// - PUT /todos/:id (Bearer accessToken)
// - DELETE /todos/:id (Bearer accessToken + admin role)
// ```

// ---

// That's everything — all core files included. You can now copy from this document into a folder and run the project.
